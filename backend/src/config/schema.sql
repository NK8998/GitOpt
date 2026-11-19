-- GitOpt PostgreSQL reference schema.
-- Runtime upgrades are applied through src/config/migrations/*.sql.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'developer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workload_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workload_id UUID NOT NULL REFERENCES workload_profiles(id),
    name VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL,
    url_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_repositories_user_id ON repositories(user_id);
CREATE INDEX IF NOT EXISTS idx_repositories_workload_id ON repositories(workload_id);

CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    duration_ms INTEGER,
    optimization_score INTEGER,
    current_stage VARCHAR(100),
    progress_percent INTEGER,
    object_distribution JSONB,
    largest_objects JSONB,
    metric_source VARCHAR(50),
    metric_notes TEXT[],
    default_branch TEXT,
    tree_truncated BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analyses_repository_id ON analyses(repository_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC);

CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    metric_type VARCHAR(100) NOT NULL,
    metric_value NUMERIC NOT NULL,
    unit VARCHAR(20) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_analysis_id ON metrics(analysis_id);
CREATE INDEX IF NOT EXISTS idx_metrics_analysis_type ON metrics(analysis_id, metric_type);

CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    description TEXT NOT NULL,
    why_recommended TEXT,
    advantages TEXT[],
    tradeoffs TEXT[],
    git_mechanism TEXT,
    impact_estimate JSONB
);

CREATE INDEX IF NOT EXISTS idx_recommendations_title ON recommendations(title);

CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    format VARCHAR(20) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_recommendation_id ON templates(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_templates_recommendation_title ON templates(recommendation_id, title);

CREATE TABLE IF NOT EXISTS analysis_recommendations (
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    relevance_score NUMERIC NOT NULL,
    reasoning TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (analysis_id, recommendation_id)
);

CREATE INDEX IF NOT EXISTS idx_analysis_recom_recom_id ON analysis_recommendations(recommendation_id);

CREATE TABLE IF NOT EXISTS benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    strategy VARCHAR(100) NOT NULL,
    clone_time_sec NUMERIC NOT NULL,
    data_transferred_mb NUMERIC NOT NULL,
    disk_usage_mb NUMERIC NOT NULL,
    relative_percent INTEGER NOT NULL,
    is_best BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_analysis_id ON benchmarks(analysis_id);


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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scalar_enlistments_repository_id
  ON scalar_enlistments(repository_id);
CREATE INDEX IF NOT EXISTS idx_scalar_enlistments_user_id
  ON scalar_enlistments(user_id);

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
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scalar_operations_enlistment_id
  ON scalar_operations(enlistment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scalar_operations_one_active
  ON scalar_operations(enlistment_id)
  WHERE status IN ('pending', 'running');
