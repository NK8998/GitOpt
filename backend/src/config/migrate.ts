import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PoolClient } from 'pg';
import { pgPool } from './database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

export async function runMigrations(): Promise<void> {
  const pool = pgPool;
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const files = (await fs.readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const existing = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [version]
      );
      if (existing.rowCount) continue;

      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      await applyMigration(client, version, sql);
    }
  } finally {
    client.release();
  }
}

async function applyMigration(
  client: PoolClient,
  version: string,
  sql: string
): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations(version) VALUES ($1)',
      [version]
    );
    await client.query('COMMIT');
    console.log(`✓ Applied database migration ${version}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(async () => {
      await pgPool.end();
    })
    .catch(async (error) => {
      console.error('Database migration failed:', error);
      await pgPool.end();
      process.exit(1);
    });
}
