CREATE TABLE IF NOT EXISTS scalar_enlistments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_path TEXT UNIQUE NOT NULL,
    worktree_path TEXT,
    clone_mode VARCHAR(50) NOT NULL DEFAULT 'scalar',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    scalar_version VARCHAR(100),
    git_version VARCHAR(100),
    maintenance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    midx_written BOOLEAN NOT NULL DEFAULT FALSE,
    midx_verified BOOLEAN NOT NULL DEFAULT FALSE,
    fsmonitor_enabled BOOLEAN,
    partial_clone_enabled BOOLEAN,
    sparse_checkout_enabled BOOLEAN,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT scalar_enlistment_status_check CHECK (
      status IN ('pending', 'cloning', 'ready', 'optimizing', 'optimized', 'failed')
    )
);

CREATE INDEX IF NOT EXISTS idx_scalar_enlistments_repository_id
  ON scalar_enlistments(repository_id);
CREATE INDEX IF NOT EXISTS idx_scalar_enlistments_user_id
  ON scalar_enlistments(user_id);
CREATE INDEX IF NOT EXISTS idx_scalar_enlistments_created_at
  ON scalar_enlistments(created_at DESC);

CREATE TABLE IF NOT EXISTS scalar_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enlistment_id UUID NOT NULL REFERENCES scalar_enlistments(id) ON DELETE CASCADE,
    operation_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    exit_code INTEGER,
    output TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT scalar_operation_status_check CHECK (
      status IN ('pending', 'running', 'completed', 'failed')
    )
);

CREATE INDEX IF NOT EXISTS idx_scalar_operations_enlistment_id
  ON scalar_operations(enlistment_id);
CREATE INDEX IF NOT EXISTS idx_scalar_operations_created_at
  ON scalar_operations(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scalar_operations_one_active
  ON scalar_operations(enlistment_id)
  WHERE status IN ('pending', 'running');
