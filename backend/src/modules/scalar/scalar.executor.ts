import { execFile } from 'node:child_process';
import path from 'node:path';
import { env } from '../../config/env';

export interface ScalarExecutionResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export class ScalarExecutor {
  async run(
    executable: 'scalar' | 'git',
    args: string[],
    options: { cwd?: string; timeoutMs?: number } = {}
  ): Promise<ScalarExecutionResult> {
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
      throw new Error('Command arguments must be a string array');
    }

    if (options.cwd) {
      path.resolve(options.cwd);
    }

    return new Promise((resolve) => {
      execFile(
        executable,
        args,
        {
          cwd: options.cwd,
          encoding: 'utf8',
          timeout: options.timeoutMs ?? env.SCALAR_COMMAND_TIMEOUT_MS,
          maxBuffer: 4 * 1024 * 1024,
          windowsHide: true,
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
          },
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
            timedOut: Boolean(execError?.killed),
          });
        }
      );
    });
  }
}

export const scalarExecutor = new ScalarExecutor();
