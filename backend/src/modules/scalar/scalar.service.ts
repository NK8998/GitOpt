import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { scalarCapabilitiesService } from './scalar.capabilities';
import { directoryBytes, scalarExecutor, ScalarExecutionResult, ScalarJobBudget } from './scalar.executor';
import { scalarRepository } from './scalar.repository';
import {
  buildManagedWorkspacePath,
  sanitizeCommandOutput,
  validateScalarRepositoryUrl,
} from './scalar.validation';
import {
  ScalarCheckoutScope,
  ScalarEnlistmentDetails,
  ScalarEnlistmentRecord,
  ScalarOperationRecord,
  ScalarOperationType,
} from './scalar.types';

function outputOf(result: ScalarExecutionResult): string {
  return sanitizeCommandOutput(
    [
      result.phases.length ? 'Git phases: ' + result.phases.join(' → ') : '',
      result.stdout, result.stderr,
    ].filter(Boolean).join('\n').trim()
  );
}

function resultError(
  label: string,
  result: ScalarExecutionResult
): string {
  if (result.failureReason) return label + ': ' + result.failureReason;
  if (result.timedOut) return `${label} timed out`;
  const output = outputOf(result);
  return output ? `${label} failed: ${output}` : `${label} failed`;
}

function boolFromGitConfig(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

export class ScalarService {
  async createEnlistment(input: {
    repository_id: string;
    checkout_scope?: ScalarCheckoutScope;
    actor_user_id?: string;
  }): Promise<ScalarEnlistmentDetails> {
    await db.init();

    const repository = await db.getRepositoryById(input.repository_id);
    if (!repository) {
      throw new AppError('Repository not found', 404);
    }

    if (input.actor_user_id && repository.user_id !== input.actor_user_id) {
      throw new AppError('Repository does not belong to the current user', 403);
    }
    const actorUserId = input.actor_user_id || repository.user_id;

    if (repository.source !== 'github') {
      throw new AppError(
        'Ultra-Large Repository Mode currently supports GitHub repositories only',
        400
      );
    }

    try {
      validateScalarRepositoryUrl(repository.url_path);
    } catch (error) {
      throw new AppError((error as Error).message, 400);
    }

    const capabilities = await scalarCapabilitiesService.detect();
    if (!capabilities.supported) {
      throw new AppError(
        'Scalar is not available with the required Git capabilities on this backend host',
        503,
        { capabilities }
      );
    }

    const checkoutScope = input.checkout_scope ?? 'root';
    if (checkoutScope === 'full' && !capabilities.clone_options.full_clone) {
      throw new AppError('This Scalar installation does not support the full working tree option', 422);
    }

    const args = ['clone', '--no-maintenance'];
    if (capabilities.clone_options.single_branch) args.push('--single-branch');
    if (capabilities.clone_options.no_tags) args.push('--no-tags');
    if (checkoutScope === 'full') args.push('--full-clone');
    const workspacePath = buildManagedWorkspacePath(repository.id, crypto.randomUUID());
    args.push(repository.url_path, workspacePath);

    let setup: Awaited<ReturnType<typeof scalarRepository.createEnlistment>>;
    try {
      setup = await scalarRepository.createEnlistment({
        repository_id: repository.id,
        user_id: actorUserId,
        workspace_path: workspacePath,
        checkout_scope: checkoutScope,
        scalar_version: capabilities.scalar.version,
        git_version: capabilities.git.version,
      });
    } catch (error) {
      if ((error as { code?: string; constraint?: string }).constraint === 'scalar_enlistments_one_active_setup') {
        throw new AppError('A Scalar workspace setup for this repository and checkout scope is already running', 409);
      }
      throw this.mapOperationConflict(error);
    }

    void this.runSetup(setup.enlistment, setup.operation, args).catch((error) => {
      console.error('Unable to persist Scalar setup outcome:', error);
    });
    return { ...setup.enlistment, operations: [setup.operation] };
  }

  async getEnlistment(
    id: string,
    actorUserId?: string
  ): Promise<ScalarEnlistmentDetails> {
    const details = await scalarRepository.getDetails(id);
    if (!details) throw new AppError('Scalar enlistment not found', 404);
    this.assertOwner(details, actorUserId);
    return details;
  }

  async getRepositoryEnlistments(
    repositoryId: string,
    actorUserId?: string
  ): Promise<ScalarEnlistmentDetails[]> {
    const repository = await db.getRepositoryById(repositoryId);
    if (!repository) throw new AppError('Repository not found', 404);
    if (actorUserId && repository.user_id !== actorUserId) {
      throw new AppError('Repository does not belong to the current user', 403);
    }

    const rows = await scalarRepository.getByRepositoryId(repositoryId);
    return Promise.all(
      rows.map(async (row) => (await scalarRepository.getDetails(row.id))!)
    );
  }

  async startMaintenance(
    id: string,
    actorUserId?: string
  ): Promise<ScalarOperationRecord> {
    const enlistment = await this.requireReadyEnlistment(id, actorUserId);
    if (enlistment.setup_status === 'failed' && !enlistment.midx_verified) {
      throw new AppError('Verify the multi-pack-index before retrying maintenance scheduling', 409);
    }

    let operation: ScalarOperationRecord;
    try {
      operation = await scalarRepository.createOperation(
        enlistment.id,
        'maintenance_start'
      );
    } catch (error) {
      throw this.mapOperationConflict(error);
    }

    void this.runMaintenance(enlistment, operation).catch((error) =>
      this.recordFailure(enlistment.id, error).catch(console.error)
    );

    return operation;
  }

  async optimizeMidx(
    id: string,
    actorUserId?: string
  ): Promise<ScalarOperationRecord> {
    const enlistment = await this.requireReadyEnlistment(id, actorUserId);

    let operation: ScalarOperationRecord;
    try {
      operation = await scalarRepository.createOperation(
        enlistment.id,
        'midx_write'
      );
    } catch (error) {
      throw this.mapOperationConflict(error);
    }

    void this.runMidx(enlistment, operation).catch((error) =>
      this.recordFailure(enlistment.id, error).catch(console.error)
    );

    return operation;
  }

  async reconcileInterruptedOperations(): Promise<number> {
    return scalarRepository.reconcileInterruptedOperations();
  }

  private async requireReadyEnlistment(
    id: string,
    actorUserId?: string
  ): Promise<ScalarEnlistmentRecord> {
    const enlistment = await scalarRepository.getById(id);
    if (!enlistment) throw new AppError('Scalar enlistment not found', 404);
    this.assertOwner(enlistment, actorUserId);
    if (enlistment.setup_status === 'running') {
      throw new AppError('The automatic Scalar setup is still running', 409);
    }

    if (!['ready', 'optimized'].includes(enlistment.status)) {
      throw new AppError(
        `Scalar enlistment is not ready for this operation (status: ${enlistment.status})`,
        409
      );
    }

    if (!enlistment.worktree_path) {
      throw new AppError('Scalar worktree path is unavailable', 409);
    }

    return enlistment;
  }

  private assertOwner(
    enlistment: Pick<ScalarEnlistmentRecord, 'user_id'>,
    actorUserId?: string
  ): void {
    if (actorUserId && enlistment.user_id !== actorUserId) {
      throw new AppError('Scalar enlistment does not belong to the current user', 403);
    }
  }

  private async runSetup(
    enlistment: ScalarEnlistmentRecord,
    clone: ScalarOperationRecord,
    args: string[]
  ): Promise<void> {
    const budget = {
      workspacePath: enlistment.workspace_path,
      deadline: Date.now() + env.SCALAR_COMMAND_TIMEOUT_MS,
      maxBytes: env.SCALAR_WORKSPACE_MAX_BYTES,
    };

    try {
      const workspace = await this.runClone(enlistment, clone, args, budget);
      await this.runMidx(workspace, await scalarRepository.createOperation(workspace.id, 'midx_write'), budget);
      await this.runMaintenance(
        workspace,
        await scalarRepository.createOperation(workspace.id, 'maintenance_start'),
        budget
      );
      await scalarRepository.updateEnlistment(workspace.id, { setup_status: 'completed' });
    } catch (error) {
      await this.recordFailure(enlistment.id, error);
    }
  }

  private async recordFailure(enlistmentId: string, error: unknown): Promise<void> {
    const enlistment = await scalarRepository.getById(enlistmentId);
    if (!enlistment) return;
    const message = sanitizeCommandOutput(error instanceof Error ? error.message : String(error));
    await scalarRepository.updateEnlistment(enlistmentId, {
      ...(enlistment.setup_status === 'running' ? { setup_status: 'failed' } : {}),
      status: !enlistment.worktree_path ? 'failed' : enlistment.midx_verified ? 'optimized' : 'ready',
      error_message: message,
    });
    if (enlistment.setup_status === 'running' && !enlistment.worktree_path) {
      await fs.rm(enlistment.workspace_path, { recursive: true, force: true }).catch((cleanupError) => {
        console.error('Unable to clean up incomplete Scalar checkout:', cleanupError);
      });
    }
  }

  private async runOperation(
    operation: ScalarOperationRecord,
    label: string,
    command: () => Promise<ScalarExecutionResult>,
    afterSuccess?: () => Promise<void>
  ): Promise<void> {
    await scalarRepository.updateOperation(operation.id, {
      status: 'running',
      started_at: new Date().toISOString(),
    });
    let result: ScalarExecutionResult | undefined;
    try {
      result = await command();
      if (!result.ok) throw new Error(resultError(label, result));
      await afterSuccess?.();
    } catch (error) {
      await scalarRepository.updateOperation(operation.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        exit_code: result?.exitCode ?? null,
        output: result ? outputOf(result) : null,
        error_message: sanitizeCommandOutput(error instanceof Error ? error.message : String(error)),
      });
      throw error;
    }

    await scalarRepository.updateOperation(operation.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      exit_code: result.exitCode,
      output: outputOf(result),
      error_message: null,
    });
  }

  private async runClone(
    enlistment: ScalarEnlistmentRecord,
    operation: ScalarOperationRecord,
    args: string[],
    budget: ScalarJobBudget
  ): Promise<ScalarEnlistmentRecord> {
    let workspace = enlistment;
    await this.runOperation(operation, 'scalar clone', async () => {
      await scalarRepository.updateEnlistment(enlistment.id, { status: 'cloning', error_message: null });
      await fs.mkdir(path.dirname(enlistment.workspace_path), { recursive: true, mode: 0o700 });
      return scalarExecutor.run('scalar', args, { traceId: operation.id, budget });
    }, async () => {
      const worktreePath = await this.resolveWorktreePath(enlistment.workspace_path);
      const [state, head, gitBytes, worktreeBytes] = await Promise.all([
        this.inspectRepositoryState(worktreePath),
        scalarExecutor.run('git', ['rev-parse', '--verify', 'HEAD'], { cwd: worktreePath, timeoutMs: 5000 }),
        directoryBytes(path.join(worktreePath, '.git')),
        directoryBytes(worktreePath, '.git'),
      ]);
      if (!head.ok || !/^[a-f0-9]{40,64}$/.test(head.stdout.trim())) {
        throw new Error('Scalar checkout did not resolve to a verified HEAD commit');
      }

      workspace = await scalarRepository.updateEnlistment(enlistment.id, {
        status: 'ready',
        worktree_path: worktreePath,
        head_commit: head.stdout.trim(),
        git_bytes: gitBytes,
        worktree_bytes: worktreeBytes,
        maintenance_enabled: false,
        ...state,
      });
    });
    return workspace;
  }

  private async runMaintenance(
    enlistment: ScalarEnlistmentRecord,
    operation: ScalarOperationRecord,
    budget?: ScalarJobBudget
  ): Promise<void> {
    await this.runOperation(operation, 'git maintenance start',
      () => scalarExecutor.run('git', ['maintenance', 'start'], {
        cwd: enlistment.worktree_path!,
        traceId: operation.id,
        budget,
      }),
      async () => {
        await scalarRepository.updateEnlistment(enlistment.id, {
          maintenance_enabled: true,
          error_message: null,
          ...(enlistment.setup_status === 'failed' ? { setup_status: 'completed' } : {}),
        });
      }
    );
  }

  private async runMidx(
    enlistment: ScalarEnlistmentRecord,
    write: ScalarOperationRecord,
    budget?: ScalarJobBudget
  ): Promise<void> {
    const cwd = enlistment.worktree_path!;
    await this.runOperation(write, 'git multi-pack-index write', async () => {
      await scalarRepository.updateEnlistment(enlistment.id, {
        status: 'optimizing',
        midx_verified: false,
        error_message: null,
      });
      return scalarExecutor.run('git', ['multi-pack-index', 'write'], { cwd, traceId: write.id, budget });
    }, async () => {
      await scalarRepository.updateEnlistment(enlistment.id, { midx_written: true });
    });

    const verify = await scalarRepository.createOperation(enlistment.id, 'midx_verify');
    await this.runOperation(verify, 'git multi-pack-index verify',
      () => scalarExecutor.run('git', ['multi-pack-index', 'verify'], { cwd, traceId: verify.id, budget }),
      async () => {
        await scalarRepository.updateEnlistment(enlistment.id, { status: 'optimized', midx_verified: true });
      }
    );
  }

  private async resolveWorktreePath(workspacePath: string): Promise<string> {
    const candidates = [
      path.join(workspacePath, 'src'),
      workspacePath,
    ];

    for (const candidate of candidates) {
      const result = await scalarExecutor.run(
        'git',
        ['rev-parse', '--is-inside-work-tree'],
        { cwd: candidate, timeoutMs: 5000 }
      );
      if (result.ok && result.stdout.trim() === 'true') {
        return candidate;
      }
    }

    throw new Error('Scalar clone completed but no Git worktree could be verified');
  }

  private async inspectRepositoryState(worktreePath: string): Promise<{
    fsmonitor_enabled: boolean | null;
    partial_clone_enabled: boolean | null;
    sparse_checkout_enabled: boolean | null;
  }> {
    const readConfig = async (key: string): Promise<boolean | null> => {
      const result = await scalarExecutor.run(
        'git',
        ['config', '--bool', '--get', key],
        { cwd: worktreePath, timeoutMs: 5000 }
      );
      if (!result.ok) return null;
      return boolFromGitConfig(result.stdout);
    };

    const [fsmonitor, promisor, sparseCheckout] = await Promise.all([
      readConfig('core.fsmonitor'),
      readConfig('remote.origin.promisor'),
      readConfig('core.sparseCheckout'),
    ]);

    return {
      fsmonitor_enabled: fsmonitor,
      partial_clone_enabled: promisor ?? false,
      sparse_checkout_enabled: sparseCheckout,
    };
  }

  private mapOperationConflict(error: unknown): AppError {
    const pgError = error as { code?: string };
    if (pgError?.code === '23505') {
      return new AppError(
        'Another Scalar operation is already active for this enlistment',
        409
      );
    }
    if (error instanceof AppError) return error;
    return new AppError('Unable to schedule Scalar operation', 500);
  }
}

export const scalarService = new ScalarService();
