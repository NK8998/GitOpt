# Scalar Integration Implementation

## Scope

GitOpt Ultra-Large Repository Mode opens a strategy comparison after analysis and offers an optional managed Scalar workspace on the backend for registered GitHub repositories. [MVP spec](ULTRA_LARGE_REPOSITORY_MVP_SPEC.md)

## Implemented flow

```text
register repository → analyze → strategy comparison
                                     |
                                     v
                         optional live Scalar setup
                                     |
                                     v
       checkout at HEAD → MIDX write → MIDX verify → schedule maintenance
```

## Capability detection

`GET /api/v1/scalar/capabilities` detects the backend host's actual Git and Scalar command surface.

GitOpt checks clone flag support and requires `--no-maintenance` to defer maintenance scheduling until MIDX verification. GitHub workspaces use standard partial clone. Microsoft Scalar’s `--no-prefetch` applies to GVFS remotes. [Microsoft Scalar source](https://github.com/microsoft/git/blob/v2.56.1.vfs.0.1/scalar.c#L930-L1017)

## Managed workspace security

Clients never submit a filesystem destination. GitOpt derives the workspace path beneath:

```text
SCALAR_WORKSPACE_ROOT
```

The clone URL is taken from the registered GitOpt repository rather than from an arbitrary command payload.

CLI execution uses `spawn` with an executable and argument array. Interactive terminal prompts are disabled. Per-operation Trace2 JSONL is stored under `.traces` inside the workspace root with an operation ID, file size limit, and seven-day retention checked at trace creation.

## PostgreSQL

Migration `002_scalar_enlistments.sql` adds:

- `scalar_enlistments`
- `scalar_operations`

Enlistments persist repository ownership, managed paths, tool versions, repository configuration state, optimization state, errors, and timestamps.

Operations persist clone, maintenance, MIDX write, and MIDX verify lifecycle records.

Migration `003_ultra_large_repository.sql` adds checkout scope, setup status, the verified HEAD, checkout byte counts, and the pinned Linux comparison snapshot.

Only one pending/running operation is permitted for an enlistment at a time.

On backend startup, unfinished operations from a previous process are marked failed so an interrupted command is never presented as completed.

## API

### Create enlistment

```http
POST /api/v1/scalar/enlistments
Content-Type: application/json

{
  "repository_id": "<uuid>",
  "checkout_scope": "root"
}
```

Returns `202 Accepted`. The checkout scope accepts `root` or `full` and defaults to `root`.

### Inspect enlistment

```http
GET /api/v1/scalar/enlistments/:id
```

Includes operation history.

### List repository enlistments

```http
GET /api/v1/scalar/repositories/:repositoryId/enlistments
```

### Enable scheduled maintenance

```http
POST /api/v1/scalar/enlistments/:id/maintenance
```

Executes `git maintenance start` in the verified worktree.

### Write and verify MIDX

```http
POST /api/v1/scalar/enlistments/:id/midx
```

Runs:

```bash
git multi-pack-index write
git multi-pack-index verify
```

Write and verification are persisted as separate operations.

## Frontend

The Analyze page offers Ultra-Large Repository Mode for the comparison. The comparison page checks backend capabilities before enabling the live action.

When selected:

1. GitOpt registers the repository and starts analysis.
2. The progress page opens the strategy comparison with the pinned Linux reference.
3. A user can start a live root-only or full working-tree checkout from that page.
4. The Scalar dashboard polls setup state and records checkout, MIDX, and maintenance scheduling outcomes.
5. The comparison and retry actions remain available from the workspace dashboard.

## Environment

```env
SCALAR_WORKSPACE_ROOT="./.gitopt-workspaces"
SCALAR_COMMAND_TIMEOUT_MS=1800000
SCALAR_WORKSPACE_MAX_BYTES=12000000000
```

The workspace directory is ignored by Git.

## Refresh the Linux reference

Run `npm run collect:ultra-large -- <phase>` from `backend`. The phases are `tree`, `history`, `root`, `full`, and `full-clone`. The command uses the pinned reference commit and records each completed pack independently. Add `--diagnostics` after a pack phase to capture redacted HTTP headers alongside Trace2.

For an extracted Microsoft Git Linux tarball, point both `PATH` and `GIT_EXEC_PATH` at the same installation. The template directory is also available in the portable installation.

```bash
gitopt_toolchain="$HOME/.local/opt/gitopt/microsoft-git-2.56.1.vfs.0.1/usr/local"
export PATH="$gitopt_toolchain/bin:$PATH"
export GIT_EXEC_PATH="$gitopt_toolchain/lib/git-core"
export GIT_TEMPLATE_DIR="$gitopt_toolchain/share/git-core/templates"
git --version
scalar version
npm run dev
```

## Current execution model

Commands execute in the long-running backend process while their state is persisted in PostgreSQL. This is sufficient for the current server deployment model. A future worker/queue can consume the same enlistment/operation records without changing the frontend contract.

## Private repositories

`GITHUB_TOKEN` is currently used by GitOpt's GitHub API analysis collector. It is not embedded in Scalar clone URLs or command output.

A private repository therefore requires Git credentials to already be available to the backend Git process. GitHub App/OAuth credential brokering remains the appropriate production implementation for multi-user private cloning.

## Acceptance status

- Scalar capability detection: implemented
- Safe CLI executor: implemented
- PostgreSQL enlistments and operation history: implemented
- Clone API: implemented
- Workspace status API: implemented
- Frontend Scalar toggle: implemented
- Scalar workspace dashboard: implemented
- Maintenance action: implemented
- MIDX write and verify: implemented
- Restart reconciliation: implemented
- Backend unit tests for capabilities and validation: implemented
- Backend and frontend CI validation: configured
