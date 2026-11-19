import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { workspaceRoot } from './scalar.validation';

const outputLimit = 64 * 1024;
const traceLimit = 16 * 1024 * 1024;
const traceRetentionMs = 7 * 24 * 60 * 60 * 1000;
const tracedCommands = new Set([
  'ls-remote', 'fetch', 'index-pack', 'sparse-checkout', 'checkout', 'multi-pack-index', 'maintenance',
]);

export interface ScalarExecutionResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  failureReason?: string;
  phases: string[];
}

export interface ScalarJobBudget {
  workspacePath: string;
  deadline: number;
  maxBytes: number;
}

interface RunOptions {
  cwd?: string;
  input?: string;
  timeoutMs?: number;
  traceId?: string;
  diagnostics?: boolean;
  budget?: ScalarJobBudget;
}

async function pathSize(target: string): Promise<number> {
  try {
    return (await fs.lstat(target)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

export async function directoryBytes(root: string, excludeAtRoot?: string): Promise<number> {
  const directories = [root];
  let total = 0;
  while (directories.length) {
    const directory = directories.pop()!;
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const sizes = await Promise.all(entries.map(async (entry) => {
      if (directory === root && entry.name === excludeAtRoot) return 0;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        directories.push(target);
        return 0;
      }
      return pathSize(target);
    }));
    for (const size of sizes) total += size;
  }
  return total;
}

async function prepareTrace(id: string): Promise<string> {
  if (!/^[\w-]{1,100}$/.test(id)) throw new Error('Invalid Git trace identifier');
  const directory = path.join(workspaceRoot(), '.traces');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const cutoff = Date.now() - traceRetentionMs;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const file = path.join(directory, entry.name);
    try {
      if ((await fs.stat(file)).mtimeMs < cutoff) await fs.unlink(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }));

  const file = path.join(directory, id + '.jsonl');
  await (await fs.open(file, 'wx', 0o600)).close();
  return file;
}

async function traceSummary(file: string): Promise<string[]> {
  if (await pathSize(file) > traceLimit) return [];
  const phases = new Set<string>();
  for (const line of (await fs.readFile(file, 'utf8')).split('\n')) {
    if (!line.startsWith('{')) continue;
    try {
      const event = JSON.parse(line);
      if (event.event === 'cmd_name' && tracedCommands.has(event.name)) phases.add(event.name);
    } catch {
      // Interrupted processes can leave an incomplete final record.
    }
  }
  return [...phases];
}

export class ScalarExecutor {
  async run(executable: 'scalar' | 'git', args: string[], options: RunOptions = {}): Promise<ScalarExecutionResult> {
    const traceFile = options.traceId ? await prepareTrace(options.traceId) : undefined;
    const curlTrace = traceFile && options.diagnostics ? traceFile + '.curl' : undefined;
    if (curlTrace) await (await fs.open(curlTrace, 'wx', 0o600)).close();

    const commandEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_TRACE2_EVENT: traceFile ?? '0',
      GIT_TRACE_CURL: curlTrace ?? '0',
      GIT_TRACE_CURL_NO_DATA: '1',
      GIT_TRACE_REDACT: '1',
    };
    const timeoutMs = Math.min(
      options.timeoutMs ?? env.SCALAR_COMMAND_TIMEOUT_MS,
      options.budget ? options.budget.deadline - Date.now() : Infinity,
    );

    async function limitError(): Promise<string | undefined> {
      if (traceFile && (await pathSize(traceFile) + (curlTrace ? await pathSize(curlTrace) : 0)) > traceLimit) {
        return 'Git trace size limit exceeded';
      }
      if (options.budget && await directoryBytes(options.budget.workspacePath) > options.budget.maxBytes) {
        return 'Scalar workspace disk budget exceeded';
      }
    }

    const initialLimit = timeoutMs > 0 ? await limitError() : 'Scalar job timed out';
    if (initialLimit) {
      return { ok: false, stdout: '', stderr: '', exitCode: null, timedOut: timeoutMs <= 0, failureReason: initialLimit, phases: [] };
    }

    return new Promise((resolve) => {
      const useProcessGroup = process.platform !== 'win32';
      const child = spawn(executable, args, {
        cwd: options.cwd,
        env: commandEnv,
        detached: useProcessGroup,
        windowsHide: true,
        stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let failureReason: string | undefined;
      let timedOut = false;
      let checking = false;
      let closed = false;
      let forceKill: NodeJS.Timeout | undefined;

      function signal(signalName: NodeJS.Signals) {
        if (!child.pid) return;
        if (useProcessGroup) {
          try {
            process.kill(-child.pid, signalName);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill(signalName);
          }
        } else {
          child.kill(signalName);
        }
      }

      function stop(reason: string) {
        if (failureReason || closed) return;
        failureReason = reason;
        signal('SIGTERM');
        forceKill = setTimeout(() => signal('SIGKILL'), 2_000);
        forceKill.unref();
      }

      const timeout = setTimeout(() => {
        timedOut = true;
        stop('Scalar job timed out');
      }, timeoutMs);
      const monitor = setInterval(async () => {
        if (checking || failureReason) return;
        checking = true;
        try {
          const exceeded = await limitError();
          if (exceeded) stop(exceeded);
        } catch {
          stop('Unable to verify Git trace or workspace size');
        } finally {
          checking = false;
        }
      }, 2_000);

      child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
        stdout = (stdout + chunk).slice(-outputLimit);
      });
      child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-outputLimit);
      });
      child.on('error', (error) => { failureReason ??= error.message; });
      if (options.input !== undefined) {
        child.stdin?.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code !== 'EPIPE') stop(error.message);
        });
        child.stdin?.end(options.input);
      }
      child.on('close', async (exitCode) => {
        closed = true;
        clearInterval(monitor);
        clearTimeout(timeout);
        if (forceKill) {
          clearTimeout(forceKill);
          signal('SIGKILL');
        }
        try {
          failureReason ??= await limitError();
        } catch {
          failureReason ??= 'Unable to verify Git trace or workspace size';
        }
        const phases = traceFile ? await traceSummary(traceFile).catch(() => []) : [];
        resolve({ ok: exitCode === 0 && !failureReason, stdout, stderr, exitCode, timedOut, failureReason, phases });
      });
    });
  }
}

export const scalarExecutor = new ScalarExecutor();
