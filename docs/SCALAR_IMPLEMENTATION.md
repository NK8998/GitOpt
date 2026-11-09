# Scalar Integration Implementation

## Scope

GitOpt Ultra-Large Repository Mode manages a Scalar workspace on the backend host for registered GitHub repositories. It extends the existing analysis flow; it does not create a checkout on the user's local computer.

## Implemented flow

```text
register repository
      |
      +--> normal GitOpt analysis
      |
      +--> optional Scalar enlistment
               |
               v
          scalar clone
               |
               v
             ready
          /         \
 maintenance       MIDX write
                       |
                       v
                   MIDX verify
                       |
                       v
                   optimized
```

## Capability detection

`GET /api/v1/scalar/capabilities` detects the backend host's actual Git and Scalar command surface.

GitOpt does not assume `--no-prefetch` exists. Clone flags are capability-driven. When supported, GitOpt uses `--no-maintenance` so the user can explicitly enable maintenance from the workspace dashboard.

## Managed workspace security

Clients never submit a filesystem destination. GitOpt derives the workspace path beneath:

```text
SCALAR_WORKSPACE_ROOT
```

The clone URL is taken from the registered GitOpt repository rather than from an arbitrary command payload.

CLI execution uses `execFile` with an executable plus argument array. Shell interpolation is not used. Interactive terminal prompts are disabled.

## PostgreSQL

Migration `002_scalar_enlistments.sql` adds:

- `scalar_enlistments`
- `scalar_operations`

Enlistments persist repository ownership, managed paths, tool versions, repository configuration state, optimization state, errors, and timestamps.

Operations persist clone, maintenance, MIDX write, and MIDX verify lifecycle records.

Only one pending/running operation is permitted for an enlistment at a time.

On backend startup, unfinished operations from a previous process are marked failed so an interrupted command is never presented as completed.

## API

### Create enlistment

```http
POST /api/v1/scalar/enlistments
Content-Type: application/json

{
  "repository_id": "<uuid>"
}
```

Returns `202 Accepted`.

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

The Analyze page includes an Ultra-Large Repo Mode toggle when the backend reports the required Scalar capabilities.

When selected:

1. GitOpt registers the repository.
2. Standard analysis starts.
3. A Scalar enlistment is created.
4. The user is routed to the Scalar workspace dashboard.
5. The dashboard polls persisted backend state.
6. The user can enable maintenance and run MIDX optimization.
7. The standard GitOpt analysis remains accessible.

## Environment

```env
SCALAR_WORKSPACE_ROOT="./.gitopt-workspaces"
SCALAR_COMMAND_TIMEOUT_MS=1800000
```

The workspace directory is ignored by Git.

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
