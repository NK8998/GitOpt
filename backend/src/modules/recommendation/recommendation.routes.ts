import { Router } from 'express';
import { z } from 'zod';
import { recommendationController } from './recommendation.controller';
import { validateRequest } from '../../middleware/validateRequest';

const router = Router();

const analysisParamSchema = z.object({
  analysisId: z.string().min(1, 'analysisId is required'),
});

// POST /api/v1/recommendations/evaluate/:analysisId
router.post(
  '/evaluate/:analysisId',
  validateRequest({ params: analysisParamSchema }),
  recommendationController.evaluate.bind(recommendationController)
);

// GET /api/v1/recommendations/analysis/:analysisId
router.get(
  '/analysis/:analysisId',
  validateRequest({ params: analysisParamSchema }),
  recommendationController.getByAnalysisId.bind(recommendationController)
);

export default router;
