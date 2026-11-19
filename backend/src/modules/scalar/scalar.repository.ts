import { QueryResultRow } from 'pg';
import { pgPool } from '../../config/database';
import {
  ScalarEnlistmentDetails,
  ScalarEnlistmentRecord,
  ScalarOperationRecord,
  ScalarOperationStatus,
  ScalarOperationType,
} from './scalar.types';

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function mapEnlistment(row: QueryResultRow): ScalarEnlistmentRecord {
  return {
    id: row.id,
    repository_id: row.repository_id,
    user_id: row.user_id,
    workspace_path: row.workspace_path,
    worktree_path: row.worktree_path ?? null,
    clone_mode: row.clone_mode,
    status: row.status,
    scalar_version: row.scalar_version ?? null,
    git_version: row.git_version ?? null,
    maintenance_enabled: Boolean(row.maintenance_enabled),
    midx_written: Boolean(row.midx_written),
    midx_verified: Boolean(row.midx_verified),
    fsmonitor_enabled:
      row.fsmonitor_enabled === null || row.fsmonitor_enabled === undefined
        ? null
        : Boolean(row.fsmonitor_enabled),
    partial_clone_enabled:
      row.partial_clone_enabled === null || row.partial_clone_enabled === undefined
        ? null
        : Boolean(row.partial_clone_enabled),
    sparse_checkout_enabled:
      row.sparse_checkout_enabled === null || row.sparse_checkout_enabled === undefined
        ? null
        : Boolean(row.sparse_checkout_enabled),
    error_message: row.error_message ?? null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function mapOperation(row: QueryResultRow): ScalarOperationRecord {
  return {
    id: row.id,
    enlistment_id: row.enlistment_id,
    operation_type: row.operation_type,
    status: row.status,
    started_at: row.started_at ? iso(row.started_at) : null,
    completed_at: row.completed_at ? iso(row.completed_at) : null,
    exit_code:
      row.exit_code === null || row.exit_code === undefined
        ? null
        : Number(row.exit_code),
    output: row.output ?? null,
    error_message: row.error_message ?? null,
    created_at: iso(row.created_at),
  };
}

export class ScalarRepository {
  async createEnlistment(data: {
    repository_id: string;
    user_id: string;
    workspace_path: string;
    scalar_version?: string | null;
    git_version?: string | null;
  }): Promise<ScalarEnlistmentRecord> {
    const result = await pgPool.query(
      `INSERT INTO scalar_enlistments(
         repository_id, user_id, workspace_path, scalar_version, git_version
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.repository_id,
        data.user_id,
        data.workspace_path,
        data.scalar_version ?? null,
        data.git_version ?? null,
      ]
    );
    return mapEnlistment(result.rows[0]);
  }

  async getById(id: string): Promise<ScalarEnlistmentRecord | null> {
    const result = await pgPool.query(
      'SELECT * FROM scalar_enlistments WHERE id = $1 LIMIT 1',
      [id]
    );
    return result.rowCount ? mapEnlistment(result.rows[0]) : null;
  }

  async getByRepositoryId(repositoryId: string): Promise<ScalarEnlistmentRecord[]> {
    const result = await pgPool.query(
      `SELECT * FROM scalar_enlistments
       WHERE repository_id = $1
       ORDER BY created_at DESC`,
      [repositoryId]
    );
    return result.rows.map(mapEnlistment);
  }

  async getDetails(id: string): Promise<ScalarEnlistmentDetails | null> {
    const enlistment = await this.getById(id);
    if (!enlistment) return null;
    return {
      ...enlistment,
      operations: await this.getOperations(id),
    };
  }

  async updateEnlistment(
    id: string,
    updates: Partial<
      Pick<
        ScalarEnlistmentRecord,
        | 'status'
        | 'worktree_path'
        | 'maintenance_enabled'
        | 'midx_written'
        | 'midx_verified'
        | 'fsmonitor_enabled'
        | 'partial_clone_enabled'
        | 'sparse_checkout_enabled'
        | 'error_message'
        | 'scalar_version'
        | 'git_version'
      >
    >
  ): Promise<ScalarEnlistmentRecord> {
    const allowed = [
      'status',
      'worktree_path',
      'maintenance_enabled',
      'midx_written',
      'midx_verified',
      'fsmonitor_enabled',
      'partial_clone_enabled',
      'sparse_checkout_enabled',
      'error_message',
      'scalar_version',
      'git_version',
    ] as const;

    const assignments: string[] = [];
    const values: unknown[] = [];

    for (const key of allowed) {
      if (!(key in updates)) continue;
      values.push(updates[key] ?? null);
      assignments.push(`${key} = $${values.length}`);
    }

    assignments.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = await pgPool.query(
      `UPDATE scalar_enlistments
       SET ${assignments.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    if (!result.rowCount) {
      throw new Error(`Scalar enlistment '${id}' not found`);
    }

    return mapEnlistment(result.rows[0]);
  }

  async createOperation(
    enlistmentId: string,
    operationType: ScalarOperationType
  ): Promise<ScalarOperationRecord> {
    const result = await pgPool.query(
      `INSERT INTO scalar_operations(enlistment_id, operation_type, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [enlistmentId, operationType]
    );
    return mapOperation(result.rows[0]);
  }

  async updateOperation(
    id: string,
    updates: {
      status?: ScalarOperationStatus;
      started_at?: string | null;
      completed_at?: string | null;
      exit_code?: number | null;
      output?: string | null;
      error_message?: string | null;
    }
  ): Promise<ScalarOperationRecord> {
    const allowed = [
      'status',
      'started_at',
      'completed_at',
      'exit_code',
      'output',
      'error_message',
    ] as const;

    const assignments: string[] = [];
    const values: unknown[] = [];

    for (const key of allowed) {
      if (!(key in updates)) continue;
      values.push(updates[key] ?? null);
      assignments.push(`${key} = $${values.length}`);
    }

    if (!assignments.length) {
      const existing = await pgPool.query(
        'SELECT * FROM scalar_operations WHERE id = $1 LIMIT 1',
        [id]
      );
      if (!existing.rowCount) throw new Error(`Scalar operation '${id}' not found`);
      return mapOperation(existing.rows[0]);
    }

    values.push(id);
    const result = await pgPool.query(
      `UPDATE scalar_operations
       SET ${assignments.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    if (!result.rowCount) {
      throw new Error(`Scalar operation '${id}' not found`);
    }

    return mapOperation(result.rows[0]);
  }

  async getOperations(enlistmentId: string): Promise<ScalarOperationRecord[]> {
    const result = await pgPool.query(
      `SELECT * FROM scalar_operations
       WHERE enlistment_id = $1
       ORDER BY created_at DESC`,
      [enlistmentId]
    );
    return result.rows.map(mapOperation);
  }

  async reconcileInterruptedOperations(): Promise<number> {
    const result = await pgPool.query(
      `UPDATE scalar_operations
       SET status = 'failed',
           completed_at = CURRENT_TIMESTAMP,
           error_message = COALESCE(
             error_message,
             'Operation interrupted by backend restart'
           )
       WHERE status IN ('pending', 'running')
       RETURNING enlistment_id`
    );

    if (result.rowCount) {
      const enlistmentIds = [...new Set(result.rows.map((row) => row.enlistment_id))];
      await pgPool.query(
        `UPDATE scalar_enlistments
         SET status = 'failed',
             error_message = COALESCE(
               error_message,
               'Last Scalar operation was interrupted by backend restart'
             ),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::uuid[])`,
        [enlistmentIds]
      );
    }

    return result.rowCount ?? 0;
  }
}

export const scalarRepository = new ScalarRepository();
