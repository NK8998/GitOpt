import { Router } from 'express';
import { z } from 'zod';
import { authenticateJWT } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';
import { scalarController } from './scalar.controller';

const router = Router();

function optionalAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  }
  next();
}

const createEnlistmentSchema = z.object({
  repository_id: z.string().uuid(),
});

router.get(
  '/capabilities',
  scalarController.getCapabilities.bind(scalarController)
);

router.post(
  '/enlistments',
  optionalAuth,
  validateRequest({ body: createEnlistmentSchema }),
  scalarController.createEnlistment.bind(scalarController)
);

router.get(
  '/repositories/:repositoryId/enlistments',
  optionalAuth,
  scalarController.getRepositoryEnlistments.bind(scalarController)
);

router.get(
  '/enlistments/:id',
  optionalAuth,
  scalarController.getEnlistment.bind(scalarController)
);

router.post(
  '/enlistments/:id/maintenance',
  optionalAuth,
  scalarController.startMaintenance.bind(scalarController)
);

router.post(
  '/enlistments/:id/midx',
  optionalAuth,
  scalarController.optimizeMidx.bind(scalarController)
);

export default router;
