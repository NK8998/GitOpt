import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import { db } from './config/database';

import authRoutes from './modules/auth/auth.routes';
import workloadRoutes from './modules/workload/workload.routes';
import repositoryRoutes from './modules/repository/repository.routes';
import analysisRoutes from './modules/analysis/analysis.routes';
import recommendationRoutes from './modules/recommendation/recommendation.routes';

export function createApp(): Application {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // System Health & Diagnostics API
  app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'git-repo-analytics-platform',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/stats', async (req: Request, res: Response) => {
    await db.init();
    res.status(200).json({
      status: 'success',
      data: {
        database_stats: db.getTableStats(),
        uptime_seconds: Math.floor(process.uptime()),
      },
    });
  });

  // REST API Modules Scope (Weeks 1-4)
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/workloads', workloadRoutes);
  app.use('/api/v1/repositories', repositoryRoutes);
  app.use('/api/v1/analyses', analysisRoutes);
  app.use('/api/v1/recommendations', recommendationRoutes);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

export default createApp;
