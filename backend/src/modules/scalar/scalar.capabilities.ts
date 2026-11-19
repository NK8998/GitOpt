import { execFile } from 'node:child_process';

export interface CommandExecutionResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  errorCode?: string;
  timedOut?: boolean;
}

export interface CapabilityCommandRunner {
  run(command: string, args: string[], timeoutMs?: number): Promise<CommandExecutionResult>;
}

export type ScalarImplementation = 'git-scalar' | 'unknown' | 'missing';

export interface ScalarCapabilities {
  supported: boolean;
  checked_at: string;
  git: {
    available: boolean;
    version: string | null;
    raw_version: string | null;
  };
  scalar: {
    executable_available: boolean;
    available: boolean;
    implementation: ScalarImplementation;
    version: string | null;
    raw_version: string | null;
  };
  commands: {
    scalar_clone: boolean;
    scalar_list: boolean;
    scalar_register: boolean;
    scalar_run: boolean;
    git_maintenance: boolean;
    git_multi_pack_index: boolean;
    git_sparse_checkout: boolean;
  };
  clone_options: {
    no_maintenance: boolean;
    no_prefetch: boolean;
    no_src: boolean;
  };
  features: {
    scalar_partial_clone_defaults: boolean;
    scalar_sparse_checkout_defaults: boolean;
    fsmonitor_verification: 'requires_repository';
  };
  warnings: string[];
}

export class SystemCapabilityCommandRunner implements CapabilityCommandRunner {
  run(command: string, args: string[], timeoutMs = 3000): Promise<CommandExecutionResult> {
    return new Promise((resolve) => {
      execFile(
        command,
        args,
        {
          encoding: 'utf8',
          timeout: timeoutMs,
          maxBuffer: 256 * 1024,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const execError = error as
            | (NodeJS.ErrnoException & {
                killed?: boolean;
                signal?: NodeJS.Signals;
              })
            | null;

          resolve({
            ok: !error,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
            exitCode:
              typeof execError?.code === 'number'
                ? execError.code
                : error
                  ? null
                  : 0,
            errorCode:
              typeof execError?.code === 'string' ? execError.code : undefined,
            timedOut: Boolean(execError?.killed && execError.signal === 'SIGTERM'),
          });
        }
      );
    });
  }
}

function combinedOutput(result: CommandExecutionResult): string {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
}

function parseGitVersion(value: string): string | null {
  const match = value.match(/git version\s+([^\s]+)/i);
  return match?.[1] ?? null;
}

function advertisesCommand(help: string, command: string): boolean {
  return help.split(/\s+/).includes(command);
}

function advertisesOption(help: string, option: string): boolean {
  if (help.includes(option)) return true;

  if (option.startsWith('--no-')) {
    const positiveName = option.slice('--no-'.length);
    return help.includes('--[no-]' + positiveName);
  }

  return false;
}

export class ScalarCapabilitiesService {
  constructor(
    private readonly runner: CapabilityCommandRunner = new SystemCapabilityCommandRunner()
  ) {}

  async detect(): Promise<ScalarCapabilities> {
    const [gitVersionResult, scalarVersionResult] = await Promise.all([
      this.runner.run('git', ['--version']),
      this.runner.run('scalar', ['version']),
    ]);

    const gitRawVersion = combinedOutput(gitVersionResult) || null;
    const scalarRawVersion = combinedOutput(scalarVersionResult) || null;
    const gitVersion = gitRawVersion ? parseGitVersion(gitRawVersion) : null;
    const scalarVersion = scalarRawVersion ? parseGitVersion(scalarRawVersion) : null;

    const gitAvailable = gitVersionResult.ok && Boolean(gitVersion);
    const scalarExecutableAvailable = scalarVersionResult.errorCode !== 'ENOENT';
    const isGitScalar =
      scalarVersionResult.ok &&
      Boolean(scalarRawVersion) &&
      /^git version\s+/i.test(scalarRawVersion!.trim()) &&
      Boolean(scalarVersion);

    const scalarImplementation: ScalarImplementation = !scalarExecutableAvailable
      ? 'missing'
      : isGitScalar
        ? 'git-scalar'
        : 'unknown';

    let scalarHelp = '';
    let scalarCloneHelp = '';
    let gitHelp = '';

    if (scalarExecutableAvailable) {
      const [helpResult, cloneHelpResult] = await Promise.all([
        this.runner.run('scalar', ['-h']),
        this.runner.run('scalar', ['clone', '-h']),
      ]);
      scalarHelp = combinedOutput(helpResult);
      scalarCloneHelp = combinedOutput(cloneHelpResult);
    }

    if (gitAvailable) {
      gitHelp = combinedOutput(await this.runner.run('git', ['help', '-a']));
    }

    const commands = {
      scalar_clone: isGitScalar && advertisesCommand(scalarHelp, 'clone'),
      scalar_list: isGitScalar && advertisesCommand(scalarHelp, 'list'),
      scalar_register: isGitScalar && advertisesCommand(scalarHelp, 'register'),
      scalar_run: isGitScalar && advertisesCommand(scalarHelp, 'run'),
      git_maintenance: gitAvailable && advertisesCommand(gitHelp, 'maintenance'),
      git_multi_pack_index: gitAvailable && advertisesCommand(gitHelp, 'multi-pack-index'),
      git_sparse_checkout: gitAvailable && advertisesCommand(gitHelp, 'sparse-checkout'),
    };

    const cloneOptions = {
      no_maintenance:
        isGitScalar && advertisesOption(scalarCloneHelp, '--no-maintenance'),
      no_prefetch:
        isGitScalar && advertisesOption(scalarCloneHelp, '--no-prefetch'),
      no_src: isGitScalar && advertisesOption(scalarCloneHelp, '--no-src'),
    };

    const warnings: string[] = [];

    if (!gitAvailable) {
      warnings.push('Git is not available on the backend host.');
    }

    if (!scalarExecutableAvailable) {
      warnings.push('Scalar is not installed or is not available on PATH.');
    } else if (!isGitScalar) {
      warnings.push(
        'A scalar executable exists, but it is not the Git Scalar large-repository tool.'
      );
    }

    if (isGitScalar && !commands.scalar_clone) {
      warnings.push('The installed Git Scalar does not advertise the clone command.');
    }

    if (isGitScalar && !cloneOptions.no_prefetch) {
      warnings.push(
        'The installed Git Scalar does not advertise --no-prefetch; clone execution must use the supported partial-clone behavior for this version.'
      );
    }

    if (gitAvailable && !commands.git_maintenance) {
      warnings.push('The installed Git does not advertise the maintenance command.');
    }

    if (gitAvailable && !commands.git_multi_pack_index) {
      warnings.push('The installed Git does not advertise the multi-pack-index command.');
    }

    const supported =
      gitAvailable &&
      isGitScalar &&
      commands.scalar_clone &&
      commands.git_maintenance &&
      commands.git_multi_pack_index;

    return {
      supported,
      checked_at: new Date().toISOString(),
      git: {
        available: gitAvailable,
        version: gitVersion,
        raw_version: gitRawVersion,
      },
      scalar: {
        executable_available: scalarExecutableAvailable,
        available: isGitScalar,
        implementation: scalarImplementation,
        version: scalarVersion,
        raw_version: scalarRawVersion,
      },
      commands,
      clone_options: cloneOptions,
      features: {
        scalar_partial_clone_defaults: isGitScalar && commands.scalar_clone,
        scalar_sparse_checkout_defaults: isGitScalar && commands.scalar_clone,
        fsmonitor_verification: 'requires_repository',
      },
      warnings,
    };
  }
}

export const scalarCapabilitiesService = new ScalarCapabilitiesService();
