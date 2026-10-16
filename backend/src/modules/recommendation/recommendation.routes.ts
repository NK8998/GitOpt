import { Router } from 'express';
import { recommendationController } from './recommendation.controller';

const router = Router();

// GET /api/v1/recommendations/:id/templates
router.get('/:id/templates', recommendationController.getTemplates.bind(recommendationController));

// GET /api/v1/recommendations/:id
router.get('/:id', recommendationController.getById.bind(recommendationController));

// POST /api/v1/recommendations/evaluate/:analysisId
router.post('/evaluate/:analysisId', recommendationController.evaluate.bind(recommendationController));

// GET /api/v1/recommendations/analysis/:analysisId
router.get('/analysis/:analysisId', recommendationController.getByAnalysisId.bind(recommendationController));

export default router;
