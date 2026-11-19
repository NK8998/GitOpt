import { Router } from 'express';
import { z } from 'zod';
import { authController } from './auth.controller';
import { authenticateJWT } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validateRequest';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['developer', 'admin', 'ci_agent', 'lead']).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

router.post(
  '/register',
  validateRequest({ body: registerSchema }),
  authController.register.bind(authController)
);

router.post(
  '/login',
  validateRequest({ body: loginSchema }),
  authController.login.bind(authController)
);

router.get(
  '/me',
  authenticateJWT,
  authController.getMe.bind(authController)
);

export default router;
