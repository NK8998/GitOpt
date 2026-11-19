import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { scalarCapabilitiesService } from './scalar.capabilities';
import { scalarExecutor, ScalarExecutionResult } from './scalar.executor';
import { scalarRepository } from './scalar.repository';
import {
  buildManagedWorkspacePath,
  sanitizeCommandOutput,
  validateScalarRepositoryUrl,
} from './scalar.validation';
import {
  ScalarEnlistmentDetails,
  ScalarEnlistmentRecord,
  ScalarOperationRecord,
  ScalarOperationType,
} from './scalar.types';

function outputOf(result: ScalarExecutionResult): string {
  return sanitizeCommandOutput(
    [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  );
}

function resultError(
  label: string,
  result: ScalarExecutionResult
): string {
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

    validateScalarRepositoryUrl(repository.url_path);

    const capabilities = await scalarCapabilitiesService.detect();
    if (!capabilities.supported) {
      throw new AppError(
        'Scalar is not available with the required Git capabilities on this backend host',
        503,
        { capabilities }
      );
    }

    const workspaceNonce = crypto.randomUUID();
    const workspacePath = buildManagedWorkspacePath(
      repository.id,
      workspaceNonce
    );

    const enlistment = await scalarRepository.createEnlistment({
      repository_id: repository.id,
      user_id: actorUserId,
      workspace_path: workspacePath,
      scalar_version: capabilities.scalar.version,
      git_version: capabilities.git.version,
    });

    let operation: ScalarOperationRecord;
    try {
      operation = await scalarRepository.createOperation(enlistment.id, 'clone');
    } catch (error) {
      throw this.mapOperationConflict(error);
    }

    void this.runClone(
      enlistment,
      operation,
      repository.url_path,
      capabilities.clone_options.no_maintenance
    ).catch((error) => {
      console.error('Scalar clone operation failed unexpectedly:', error);
    });

    return (await scalarRepository.getDetails(enlistment.id))!;
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

    let operation: ScalarOperationRecord;
    try {
      operation = await scalarRepository.createOperation(
        enlistment.id,
        'maintenance_start'
      );
    } catch (error) {
      throw this.mapOperationConflict(error);
    }

    void this.runMaintenance(enlistment, operation).catch((error) => {
      console.error('Scalar maintenance operation failed unexpectedly:', error);
    });

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

    void this.runMidx(enlistment, operation).catch((error) => {
      console.error('Scalar MIDX operation failed unexpectedly:', error);
    });

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

  private async runClone(
    enlistment: ScalarEnlistmentRecord,
    operation: ScalarOperationRecord,
    repositoryUrl: string,
    disableMaintenance: boolean
  ): Promise<void> {
    await scalarRepository.updateOperation(operation.id, {
      status: 'running',
      started_at: new Date().toISOString(),
    });
    await scalarRepository.updateEnlistment(enlistment.id, {
      status: 'cloning',
      error_message: null,
    });

    try {
      await fs.mkdir(path.dirname(enlistment.workspace_path), {
        recursive: true,
      });

      const args = ['clone'];
      if (disableMaintenance) args.push('--no-maintenance');
      args.push(repositoryUrl, enlistment.workspace_path);

      const result = await scalarExecutor.run('scalar', args);
      if (!result.ok) {
        throw new Error(resultError('scalar clone', result));
      }

      const worktreePath = await this.resolveWorktreePath(
        enlistment.workspace_path
      );
      const state = await this.inspectRepositoryState(worktreePath);

      await scalarRepository.updateEnlistment(enlistment.id, {
        status: 'ready',
        worktree_path: worktreePath,
        maintenance_enabled: disableMaintenance ? false : true,
        fsmonitor_enabled: state.fsmonitor_enabled,
        partial_clone_enabled: state.partial_clone_enabled,
        sparse_checkout_enabled: state.sparse_checkout_enabled,
        error_message: null,
      });

      await scalarRepository.updateOperation(operation.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        exit_code: result.exitCode,
        output: outputOf(result),
        error_message: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await scalarRepository.updateEnlistment(enlistment.id, {
        status: 'failed',
        error_message: sanitizeCommandOutput(message),
      });
      await scalarRepository.updateOperation(operation.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        exit_code: 1,
        error_message: sanitizeCommandOutput(message),
      });
    }
  }

  private async runMaintenance(
    enlistment: ScalarEnlistmentRecord,
    operation: ScalarOperationRecord
  ): Promise<void> {
    await scalarRepository.updateOperation(operation.id, {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    const result = await scalarExecutor.run(
      'git',
      ['maintenance', 'start'],
      { cwd: enlistment.worktree_path! }
    );

    if (result.ok) {
      await scalarRepository.updateEnlistment(enlistment.id, {
        maintenance_enabled: true,
        error_message: null,
      });
      await scalarRepository.updateOperation(operation.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        exit_code: result.exitCode,
        output: outputOf(result),
      });
      return;
    }

    const message = resultError('git maintenance start', result);
    await scalarRepository.updateOperation(operation.id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      exit_code: result.exitCode,
      output: outputOf(result),
      error_message: message,
    });
  }

  private async runMidx(
    enlistment: ScalarEnlistmentRecord,
    writeOperation: ScalarOperationRecord
  ): Promise<void> {
    await scalarRepository.updateEnlistment(enlistment.id, {
      status: 'optimizing',
      error_message: null,
    });
    await scalarRepository.updateOperation(writeOperation.id, {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    const write = await scalarExecutor.run(
      'git',
      ['multi-pack-index', 'write'],
      { cwd: enlistment.worktree_path! }
    );

    if (!write.ok) {
      const message = resultError('git multi-pack-index write', write);
      await scalarRepository.updateEnlistment(enlistment.id, {
        status: 'ready',
        error_message: message,
      });
      await scalarRepository.updateOperation(writeOperation.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        exit_code: write.exitCode,
        output: outputOf(write),
        error_message: message,
      });
      return;
    }

    await scalarRepository.updateEnlistment(enlistment.id, {
      midx_written: true,
    });
    await scalarRepository.updateOperation(writeOperation.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      exit_code: write.exitCode,
      output: outputOf(write),
    });

    let verifyOperation: ScalarOperationRecord;
    try {
      verifyOperation = await scalarRepository.createOperation(
        enlistment.id,
        'midx_verify'
      );
    } catch (error) {
      await scalarRepository.updateEnlistment(enlistment.id, {
        status: 'ready',
        error_message: 'MIDX was written but verification could not be scheduled',
      });
      return;
    }

    await scalarRepository.updateOperation(verifyOperation.id, {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    const verify = await scalarExecutor.run(
      'git',
      ['multi-pack-index', 'verify'],
      { cwd: enlistment.worktree_path! }
    );

    if (verify.ok) {
      await scalarRepository.updateEnlistment(enlistment.id, {
        status: 'optimized',
        midx_verified: true,
        error_message: null,
      });
      await scalarRepository.updateOperation(verifyOperation.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        exit_code: verify.exitCode,
        output: outputOf(verify),
      });
      return;
    }

    const message = resultError('git multi-pack-index verify', verify);
    await scalarRepository.updateEnlistment(enlistment.id, {
      status: 'ready',
      midx_verified: false,
      error_message: message,
    });
    await scalarRepository.updateOperation(verifyOperation.id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      exit_code: verify.exitCode,
      output: outputOf(verify),
      error_message: message,
    });
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
      partial_clone_enabled: promisor,
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
