import { Router } from 'express';
import { benchmarkController } from './benchmark.controller';

const router = Router();

// POST /api/v1/benchmarks
router.post('/', benchmarkController.runBenchmark.bind(benchmarkController));

// GET /api/v1/benchmarks/analysis/:analysis_id
router.get('/analysis/:analysis_id', benchmarkController.getByAnalysisId.bind(benchmarkController));

// GET /api/v1/benchmarks/:id
router.get('/:id', benchmarkController.getByAnalysisId.bind(benchmarkController));

export default router;
