import { createServer as createViteServer } from 'vite';
import path from 'path';
import express from 'express';
import { createApp } from './src/app';
import { env } from './src/config/env';
import { db, pgPool } from './src/config/database';
import { runMigrations } from './src/config/migrate';
import { scalarService } from './src/modules/scalar/scalar.service';

async function startServer() {
  // Bring PostgreSQL to the schema expected by the current application before
  // services begin reading or seeding reference data.
  await runMigrations();
  await db.init();
  const interruptedScalarOperations = await scalarService.reconcileInterruptedOperations();
  if (interruptedScalarOperations > 0) {
    console.warn(`⚠ Reconciled ${interruptedScalarOperations} interrupted Scalar operation(s).`);
  }

  const app = createApp();
  const port = env.PORT || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 GitOptima Performance Analytics Platform started!`);
    console.log(`🌐 Web UI & API running on: http://0.0.0.0:${port}`);
    console.log(`🐘 PostgreSQL: ${env.PGHOST}:${env.PGPORT}/${env.PGDATABASE}`);
    console.log(`📡 Endpoints:`);
    console.log(`   - Auth:            http://0.0.0.0:${port}/api/v1/auth`);
    console.log(`   - Workloads:       http://0.0.0.0:${port}/api/v1/workloads`);
    console.log(`   - Repositories:    http://0.0.0.0:${port}/api/v1/repositories`);
    console.log(`   - Analyses:        http://0.0.0.0:${port}/api/v1/analyses`);
    console.log(`   - Recommendations: http://0.0.0.0:${port}/api/v1/recommendations\n`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Closing HTTP server and PostgreSQL pool...`);
    server.close(async () => {
      await pgPool.end();
      process.exit(0);
    });
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

startServer().catch(async (err) => {
  console.error('Failed to start server:', err);
  await pgPool.end().catch(() => undefined);
  process.exit(1);
});
