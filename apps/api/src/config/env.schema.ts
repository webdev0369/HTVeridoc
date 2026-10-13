import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  STORAGE_ROOT: z.string().default('./storage/htveridoc'),
  MAX_UPLOAD_BYTES: z.coerce.number().default(26_214_400),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  /** Public web origin for editor links in webhooks (defaults to CORS_ORIGIN). */
  PUBLIC_WEB_URL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-3-flash-preview'),
  /**
   * Encrypts per-organization integration secrets at rest.
   * Falls back to JWT_ACCESS_SECRET when unset (dev only).
   */
  INTEGRATIONS_SECRET_KEY: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;
