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
});

// POST /api/v1/analyses
router.post(
  '/',
  validateRequest({ body: triggerAnalysisSchema }),
  analysisController.trigger.bind(analysisController)
);

// GET /api/v1/analyses/:id
router.get('/:id', analysisController.getById.bind(analysisController));

export default router;
