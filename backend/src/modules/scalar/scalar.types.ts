export type ScalarEnlistmentStatus =
  | 'pending'
  | 'cloning'
  | 'ready'
  | 'optimizing'
  | 'optimized'
  | 'failed';

export type ScalarOperationStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

export type ScalarOperationType =
  | 'clone'
  | 'maintenance_start'
  | 'midx_write'
  | 'midx_verify';

export interface ScalarEnlistmentRecord {
  id: string;
  repository_id: string;
  user_id: string;
  workspace_path: string;
  worktree_path: string | null;
  clone_mode: string;
  status: ScalarEnlistmentStatus;
  scalar_version: string | null;
  git_version: string | null;
  maintenance_enabled: boolean;
  midx_written: boolean;
  midx_verified: boolean;
  fsmonitor_enabled: boolean | null;
  partial_clone_enabled: boolean | null;
  sparse_checkout_enabled: boolean | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScalarOperationRecord {
  id: string;
  enlistment_id: string;
  operation_type: ScalarOperationType;
  status: ScalarOperationStatus;
  started_at: string | null;
  completed_at: string | null;
  exit_code: number | null;
  output: string | null;
  error_message: string | null;
  created_at: string;
}

export interface ScalarEnlistmentDetails extends ScalarEnlistmentRecord {
  operations: ScalarOperationRecord[];
}
