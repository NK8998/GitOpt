import { Router } from 'express';
import { workloadController } from './workload.controller';

const router = Router();

// GET /api/v1/workloads
router.get('/', workloadController.getWorkloads.bind(workloadController));

// GET /api/v1/workloads/:id
router.get('/:id', workloadController.getWorkloadById.bind(workloadController));

export default router;
