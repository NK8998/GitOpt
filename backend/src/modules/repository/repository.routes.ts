import { Router } from 'express';
import { z } from 'zod';
import { repositoryController } from './repository.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticateJWT } from '../../middleware/auth';

const router = Router();

const createRepositorySchema = z.object({
  workload_id: z.string().min(1, 'workload_id is required'),
  name: z.string().min(1, 'Repository name is required').max(255),
  source: z.enum(['github', 'gitlab', 'local']).default('github'),
  url_path: z.string().min(1, 'Repository URL or path is required'),
  user_id: z.string().min(1).optional(),
});

// Middleware that optionally checks JWT: if present, sets req.user
function optionalAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  }
  next();
}

// POST /api/v1/repositories
router.post(
  '/',
  optionalAuth,
  validateRequest({ body: createRepositorySchema }),
  repositoryController.register.bind(repositoryController)
);

// GET /api/v1/repositories
router.get(
  '/',
  optionalAuth,
  repositoryController.getMyRepositories.bind(repositoryController)
);

// GET /api/v1/repositories/:id
router.get(
  '/:id',
  repositoryController.getRepositoryById.bind(repositoryController)
);

// DELETE /api/v1/repositories/:id
router.delete(
  '/:id',
  optionalAuth,
  repositoryController.deleteRepository.bind(repositoryController)
);

export default router;
