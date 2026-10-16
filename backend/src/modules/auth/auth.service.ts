import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, UserRecord } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { UserPayload } from '../../types/express';

export class AuthService {
  async register(data: {
    name: string;
    email: string;
    password: string;
    role?: string;
  }): Promise<{ user: Omit<UserRecord, 'password_hash'>; token: string }> {
    const existing = await db.findUserByEmail(data.email);
    if (existing) {
      throw new AppError('A user with this email address already exists', 409);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);

    const newUser = await db.createUser({
      name: data.name,
      email: data.email.toLowerCase(),
      password_hash: passwordHash,
      role: data.role || 'developer',
    });

    const payload: UserPayload = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    // Omit password hash
    const { password_hash, ...safeUser } = newUser;
    return { user: safeUser, token };
  }

  async login(credentials: {
    email: string;
    password: string;
  }): Promise<{ user: Omit<UserRecord, 'password_hash'>; token: string }> {
    const user = await db.findUserByEmail(credentials.email);
    if (!user) {
      throw new AppError('Invalid email or password credentials', 401);
    }

    const isMatch = await bcrypt.compare(credentials.password, user.password_hash);
    if (!isMatch) {
      throw new AppError('Invalid email or password credentials', 401);
    }

    const payload: UserPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    const { password_hash, ...safeUser } = user;
    return { user: safeUser, token };
  }

  async getMe(userId: string): Promise<Omit<UserRecord, 'password_hash'>> {
    const user = await db.findUserById(userId);
    if (!user) {
      throw new AppError('User profile not found', 404);
    }
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }
}

export const authService = new AuthService();
