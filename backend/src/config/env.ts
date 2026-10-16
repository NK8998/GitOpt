import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional()
);

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().default('gitoptima-super-secret-development-jwt-key-2026'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // DATABASE_URL takes precedence when present. Otherwise local development
  // uses the standard PostgreSQL fields below. Port 5432 is the requested local default.
  DATABASE_URL: optionalNonEmptyString,
  PGHOST: z.string().default('127.0.0.1'),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGUSER: z.string().default('postgres'),
  PGPASSWORD: z.string().default(''),
  PGDATABASE: z.string().default('gitopt'),
  PGPOOL_MAX: z.coerce.number().int().positive().default(10),

  GITHUB_TOKEN: optionalNonEmptyString,
}).superRefine((values, context) => {
  if (values.NODE_ENV !== 'test' && !values.DATABASE_URL && !values.PGPASSWORD) {
    context.addIssue({
      code: 'custom',
      path: ['PGPASSWORD'],
      message: 'Set PGPASSWORD for local PostgreSQL or provide DATABASE_URL',
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
