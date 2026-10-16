import { createServer as createViteServer } from 'vite';
import path from 'path';
import express from 'express';
import { createApp } from './src/app';
import { env } from './src/config/env';
import { db } from './src/config/database';

async function startServer() {
  // Initialize and seed relational database
  await db.init();

  const app = createApp();
  const port = env.PORT || 3000;

  // Mount Vite development middlewares in dev mode
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets if built
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`\n🚀 GitOptima Performance Analytics Platform started!`);
    console.log(`🌐 Web UI & API running on: http://0.0.0.0:${port}`);
    console.log(`📡 Endpoints:`);
    console.log(`   - Auth:            http://0.0.0.0:${port}/api/v1/auth`);
    console.log(`   - Workloads:       http://0.0.0.0:${port}/api/v1/workloads`);
    console.log(`   - Repositories:    http://0.0.0.0:${port}/api/v1/repositories`);
    console.log(`   - Analyses:        http://0.0.0.0:${port}/api/v1/analyses`);
    console.log(`   - Recommendations: http://0.0.0.0:${port}/api/v1/recommendations\n`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
