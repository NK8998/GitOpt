import { Router } from 'express';
import { z } from 'zod';
import { analysisController } from './analysis.controller';
import { validateRequest } from '../../middleware/validateRequest';

const router = Router();

const triggerAnalysisSchema = z.object({
  repository_id: z.string().min(1, 'repository_id is required'),
  simulated_metrics: z
    .object({
      repo_size_mb: z.number().nonnegative().optional(),
      commit_count: z.number().int().nonnegative().optional(),
      file_count: z.number().int().nonnegative().optional(),
      large_file_count: z.number().int().nonnegative().optional(),
    })
    .optional(),
  advanced_options: z.record(z.string(), z.boolean()).optional(),
});

// GET /api/v1/analyses (history)
router.get('/', analysisController.getAll.bind(analysisController));

// POST /api/v1/analyses (trigger new analysis)
router.post(
  '/',
  validateRequest({ body: triggerAnalysisSchema }),
  analysisController.trigger.bind(analysisController)
);

// GET /api/v1/analyses/:id
router.get('/:id', analysisController.getById.bind(analysisController));

// GET /api/v1/analyses/:id/recommendations
router.get('/:id/recommendations', analysisController.getRecommendations.bind(analysisController));

// GET /api/v1/analyses/:id/benchmarks
router.get('/:id/benchmarks', analysisController.getBenchmarks.bind(analysisController));

export default router;
