# PostgreSQL and Node.js Implementation Specification

## 1. Purpose

GitOpt currently declares PostgreSQL dependencies and a relational schema, but the backend runtime stores data in process-local `Map` instances. This document defines the migration from that in-memory store to PostgreSQL using Node.js and the existing `pg` package.

The target architecture preserves the current Express controllers and service APIs while replacing the persistence implementation with durable PostgreSQL data access.

## 2. Current state

The backend already includes:

- `pg` in `backend/package.json`.
- `DATABASE_URL` support in `backend/src/config/env.ts`.
- A relational schema in `backend/src/config/schema.sql`.
- Service modules for users, repositories, analyses, recommendations, workloads, and benchmarks.

The current runtime database is implemented in `backend/src/config/database.ts` with in-memory `Map` instances. This means:

- Data is lost when the server restarts.
- Multiple backend instances do not share state.
- Newly created repositories and analyses are not durable.
- The PostgreSQL schema is not currently the source of truth.

## 3. PostgreSQL connection

The local PostgreSQL server is running on port `5432`.

Example local connection string:

```env
DATABASE_URL=postgresql://gitopt:gitopt_dev_password@localhost:5432/gitopt
```

If PostgreSQL is started with Docker:

```bash
docker run --name gitopt-postgres \
  -e POSTGRES_USER=gitopt \
  -e POSTGRES_PASSWORD=gitopt_dev_password \
  -e POSTGRES_DB=gitopt \
  -p 5432:5432 \
  -d postgres:16
```

The connection string must be provided through environment configuration and must not be committed to the repository.

## 4. Target architecture

```text
Express route
    ↓
Controller
    ↓
Service
    ↓
PostgreSQL repository/data-access module
    ↓
pg connection pool
    ↓
PostgreSQL
```

Recommended backend structure:

```text
backend/src/
  config/
    database.ts
    env.ts
    schema.sql

  db/
    migrations/
      001_initial_schema.sql
      002_analysis_fields.sql
    repositories/
      user.repository.ts
      workload.repository.ts
      repository.repository.ts
      analysis.repository.ts
      recommendation.repository.ts
      benchmark.repository.ts
```

Services remain responsible for business rules. Repository modules own SQL and row mapping.

## 5. Connection pool

Replace the in-memory database implementation with a PostgreSQL pool:

```ts
import { Pool, type PoolClient, type QueryResultRow } from "pg"
import { env } from "./env"

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.NODE_ENV === "production" ? 20 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl:
    env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
})

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error)
})

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return pool.query<T>(text, values)
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    const result = await callback(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
```

All user-controlled values must use PostgreSQL parameters such as `$1`, `$2`, and `$3`. SQL string interpolation must not be used.

## 6. Environment validation

`DATABASE_URL` should be required outside of tests:

```ts
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("24h"),
  DATABASE_URL: z.string().url(),
  GITHUB_TOKEN: optionalNonEmptyString,
})
```

The application should fail during startup if the database connection or schema initialization fails. It should not silently fall back to in-memory storage in production.

## 7. Schema alignment

The existing schema covers:

- Users
- Workload profiles
- Repositories
- Analyses
- Metrics
- Recommendations
- Templates
- Analysis/recommendation relationships
- Benchmarks

The runtime analysis model currently contains additional fields that should be represented in PostgreSQL:

- `optimization_score`
- `current_stage`
- `progress_percent`
- `metric_source`
- `metric_notes`
- `default_branch`
- `tree_truncated`
- `object_distribution`
- `largest_objects`
- `error_message`
- `updated_at`

Recommended analysis table shape:

```sql
CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL
        REFERENCES repositories(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'analyzing', 'completed', 'failed')),
    duration_ms INTEGER,
    optimization_score NUMERIC,
    current_stage VARCHAR(50),
    progress_percent INTEGER
        CHECK (progress_percent >= 0 AND progress_percent <= 100),
    metric_source VARCHAR(50)
        CHECK (metric_source IN ('github_api', 'git_cli', 'simulated')),
    metric_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_branch VARCHAR(255),
    tree_truncated BOOLEAN NOT NULL DEFAULT FALSE,
    object_distribution JSONB,
    largest_objects JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analyses_repository_created
    ON analyses(repository_id, created_at DESC);
```

Recommended metric constraints and index:

```sql
ALTER TABLE metrics
    ADD CONSTRAINT metrics_value_non_negative
    CHECK (metric_value >= 0);

CREATE INDEX IF NOT EXISTS idx_metrics_analysis_type
    ON metrics(analysis_id, metric_type);
```

If the product should prevent one user from registering the same URL repeatedly, add a user-scoped unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_repositories_user_url
    ON repositories(user_id, url_path);
```

## 8. Migrations

Schema creation should move from startup-only `CREATE TABLE IF NOT EXISTS` statements to versioned migrations:

```text
backend/src/config/migrations/
  001_initial_schema.sql
  002_analysis_fields.sql
  003_recommendation_metadata.sql
  004_indexes_and_constraints.sql
```

The migration process should:

1. Create a `schema_migrations` table.
2. Read migrations in filename order.
3. Skip versions already recorded.
4. Run each new migration inside a transaction.
5. Record the migration version only after success.
6. Fail startup if a migration fails.

Example migration table:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

A small `pg`-based migration runner is sufficient. `node-pg-migrate` is also an appropriate dependency if a dedicated migration tool is preferred.

## 9. Data-access modules

Replace methods on the in-memory `RelationalDatabaseStore` with typed repository modules.

Example repository creation:

```ts
import { query } from "../client"
import type { RepositoryRecord } from "../../types/metrics"

interface RepositoryRow {
  id: string
  user_id: string
  workload_id: string
  name: string
  source: "github" | "gitlab" | "local"
  url_path: string
  created_at: string
}

export async function createRepository(input: {
  userId: string
  workloadId: string
  name: string
  source: "github" | "gitlab" | "local"
  urlPath: string
}): Promise<RepositoryRecord> {
  const result = await query<RepositoryRow>(
    `
      INSERT INTO repositories (
        user_id,
        workload_id,
        name,
        source,
        url_path
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, workload_id, name, source, url_path, created_at
    `,
    [
      input.userId,
      input.workloadId,
      input.name,
      input.source,
      input.urlPath,
    ],
  )

  return result.rows[0]
}
```

Joined queries should load related workload data directly:

```sql
SELECT
    r.id,
    r.user_id,
    r.workload_id,
    r.name,
    r.source,
    r.url_path,
    r.created_at,
    w.slug AS workload_slug,
    w.name AS workload_name,
    w.description AS workload_description
FROM repositories r
JOIN workload_profiles w
    ON w.id = r.workload_id
WHERE r.user_id = $1
ORDER BY r.created_at DESC;
```

## 10. Analysis persistence

The existing analysis lifecycle should remain:

```text
POST /analyses
    ↓
status=analyzing, stage=discovery
    ↓
metadata
    ↓
metrics
    ↓
recommendations
    ↓
completed or failed
```

Create an analysis:

```sql
INSERT INTO analyses (
    repository_id,
    status,
    current_stage,
    progress_percent
)
VALUES ($1, 'analyzing', 'discovery', 10)
RETURNING *;
```

Update progress:

```sql
UPDATE analyses
SET
    current_stage = $2,
    progress_percent = $3,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;
```

Metric writes should be transactional. If an analysis is rerun, delete or replace the previous metric set atomically with the analysis metadata update.

## 11. Recommendations and benchmarks

The deterministic recommendation rules engine should remain unchanged. PostgreSQL should replace only the persistence layer:

```text
repository evidence
       +
selected workload
       ↓
deterministic rule evaluation
       ↓
analysis_recommendations rows
       ↓
reasoning + relevance score + templates
```

Recommendation evaluation should run in a transaction:

1. Delete previous relationships for the analysis.
2. Evaluate the rules.
3. Insert matched recommendations.
4. Insert relevance scores and reasoning.
5. Commit.

Benchmark rows should also be stored against the analysis ID and deleted automatically when the analysis is deleted.

## 12. Authentication and ownership

The PostgreSQL migration is also an opportunity to remove demo-only ownership fallbacks.

Production behavior should:

- Require JWT authentication for private repository and analysis endpoints.
- Derive `user_id` only from `req.user.id`.
- Never accept `user_id` from the request body.
- Scope repository and analysis reads to the authenticated user.
- Prevent users from reading another user's records by guessing a UUID.

Example scoped analysis query:

```sql
SELECT a.*
FROM analyses a
JOIN repositories r
    ON r.id = a.repository_id
WHERE a.id = $1
  AND r.user_id = $2;
```

The current default-user fallback should be retained only for an explicitly isolated development mode, if it is needed at all.

## 13. Seeds

Seed data should be separate from schema migrations:

```text
backend/src/config/seeds/
  workload_profiles.sql
  recommendations.sql
  default_user.sql
```

Use `ON CONFLICT` for repeatable system seeds. Do not use a known default password in production.

Recommended startup sequence:

```ts
await assertDatabaseConnection()
await runMigrations()
await runSeeds()
```

## 14. API compatibility

The frontend API contract can remain unchanged:

```text
POST   /api/v1/repositories
GET    /api/v1/repositories
GET    /api/v1/repositories/:id
DELETE /api/v1/repositories/:id

POST   /api/v1/analyses
GET    /api/v1/analyses
GET    /api/v1/analyses/:id

GET    /api/v1/analyses/:id/recommendations
GET    /api/v1/analyses/:id/benchmarks
POST   /api/v1/benchmarks
```

The important change is that these endpoints return durable records instead of process-local records.

The frontend repository context should eventually hydrate from `GET /api/v1/repositories` so the active repository survives a page refresh. The current context is useful for passing repository data from the Analyze page to the sidebar, but it is intentionally in-memory in the browser.

## 15. Background analysis jobs

The current analysis service starts work inside the Express process. That is acceptable for local development but is not durable:

- A restart interrupts active analysis.
- There is no durable retry policy.
- Multiple server instances can compete for work.
- Long-running analysis competes with HTTP requests.

The production flow should be:

```text
POST /analyses
    ↓
Create pending analysis row
    ↓
Publish analysis job
    ↓
Worker claims job
    ↓
Collect metrics and persist progress
    ↓
Complete or fail analysis
```

`pg-boss` is a reasonable PostgreSQL-backed queue option. BullMQ with Redis is another option if Redis is already part of the deployment platform.

## 16. Error handling

Map database errors to safe application errors:

- Unique violation (`23505`) → HTTP `409 Conflict`
- Foreign-key violation (`23503`) → HTTP `400` or `404`
- Missing row → HTTP `404`
- Connection failure → HTTP `503 Service Unavailable`
- Unexpected SQL failure → HTTP `500`

Do not expose raw SQL errors, passwords, tokens, or connection strings to clients.

## 17. Testing

Keep database-independent unit tests for:

- Recommendation rule evaluation
- Metric calculation
- GitHub response mapping
- Validation helpers

Add PostgreSQL integration tests for:

- Repository creation
- Foreign-key enforcement
- User-scoped repository queries
- Analysis lifecycle updates
- Metric persistence
- Recommendation joins
- Benchmark persistence
- Cascade deletion
- Transaction rollback

Use a dedicated test database or Testcontainers. Never run integration tests against the development database.

Important cascade test:

```text
Create repository
Create analysis
Create metrics
Delete repository
Verify analysis, metrics, recommendations, and benchmarks are deleted
```

## 18. Implementation phases

### Phase 1: Database foundation

- Add the PostgreSQL pool.
- Require and validate `DATABASE_URL`.
- Add migrations.
- Apply the schema on the PostgreSQL instance at `localhost:5432`.
- Add a database health check.

### Phase 2: Core persistence

- Replace in-memory users and workloads.
- Replace repository creation and lookup.
- Replace authentication user lookup.
- Remove the default-user fallback for authenticated requests.

### Phase 3: Analysis persistence

- Replace analysis CRUD.
- Replace metric persistence.
- Persist all analysis metadata fields.
- Add transactions around metric and metadata writes.

### Phase 4: Recommendations and benchmarks

- Replace recommendation and template access.
- Replace analysis/recommendation junction operations.
- Replace benchmark persistence.
- Verify that frontend response shapes remain compatible.

### Phase 5: Frontend hydration

- Add repository listing to application startup.
- Hydrate `RepositoryContext` from PostgreSQL-backed API data.
- Store the active repository ID.
- Recover the active repository after refresh.

### Phase 6: Production processing

- Move analysis execution to a durable worker.
- Add retries and failure recovery.
- Add integration tests.
- Add backup and restore procedures.

## 19. Deployment checklist

- [ ] PostgreSQL is available on port `5432` locally or through the production provider.
- [ ] `DATABASE_URL` is configured as a secret.
- [ ] Migrations run during deployment.
- [ ] Seeds run separately from migrations.
- [ ] In-memory `Map` storage is removed.
- [ ] Authentication is required for private resources.
- [ ] Default-user fallback is disabled in production.
- [ ] Queries enforce user ownership.
- [ ] PostgreSQL SSL is enabled for managed production databases.
- [ ] Pool size is configured for the deployment topology.
- [ ] Database backups and restore procedures are documented.
- [ ] Analysis jobs are durable and retryable.
- [ ] PostgreSQL integration tests run in CI.
- [ ] No secrets are committed.

## 20. Recommended outcome

The lowest-risk implementation for GitOpt is:

- `pg` connection pool
- Raw parameterized SQL
- Typed repository/data-access modules
- Versioned SQL migrations
- PostgreSQL transactions for multi-table writes
- `JSONB` for structured analysis metadata
- Existing service classes retained for business logic
- Durable analysis jobs added after core persistence is complete

This approach removes the in-memory database without requiring a full ORM rewrite and preserves the current REST API contract.
