ALTER TABLE scalar_enlistments
    ADD COLUMN checkout_scope TEXT NOT NULL DEFAULT 'root' CHECK (checkout_scope IN ('root', 'full')),
    ADD COLUMN setup_status TEXT CHECK (setup_status IN ('running', 'completed', 'failed')),
    ADD COLUMN head_commit TEXT,
    ADD COLUMN git_bytes BIGINT,
    ADD COLUMN worktree_bytes BIGINT;

CREATE UNIQUE INDEX scalar_enlistments_one_active_setup
    ON scalar_enlistments (user_id, repository_id, checkout_scope)
    WHERE setup_status = 'running';

CREATE TABLE ultra_large_snapshots (
    repository TEXT NOT NULL,
    branch TEXT NOT NULL,
    head_commit TEXT NOT NULL,
    tree_sha TEXT NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL,
    git_version TEXT NOT NULL,
    repository_bytes BIGINT NOT NULL CHECK (repository_bytes >= 0),
    root_checkout_bytes BIGINT NOT NULL CHECK (root_checkout_bytes >= 0),
    full_checkout_bytes BIGINT NOT NULL CHECK (full_checkout_bytes >= 0),
    history_pack_bytes BIGINT CHECK (history_pack_bytes > 0),
    root_pack_bytes BIGINT CHECK (root_pack_bytes > 0),
    full_checkout_pack_bytes BIGINT CHECK (full_checkout_pack_bytes > 0),
    full_clone_pack_bytes BIGINT CHECK (full_clone_pack_bytes > 0),
    provenance JSONB NOT NULL DEFAULT '{}',
    collection_outcomes JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (repository, branch, head_commit)
);

INSERT INTO ultra_large_snapshots (
    repository, branch, head_commit, tree_sha, collected_at, git_version,
    repository_bytes, root_checkout_bytes, full_checkout_bytes, root_pack_bytes,
    provenance, collection_outcomes
) VALUES (
    'torvalds/linux', 'master', '4405c18c95d2d0f99f6c581ef0ee8591a1aa6ccd',
    'f07c049f80f98f71047c0a29a357de05e240e0ad', '2026-11-19T15:20:00Z', '2.53.0',
    6626454528, 1252207, 1676103698, 326059,
    '{"repository_bytes":{"source":"github_repository_metadata"},"root_checkout_bytes":{"source":"github_tree"},"full_checkout_bytes":{"source":"github_tree"},"root_pack_bytes":{"source":"git_pack","git_version":"2.53.0"}}',
    '{"history":{"status":"failed","reason":"The cold blobless fetch timed out"},"root":{"status":"completed"}}'
);
