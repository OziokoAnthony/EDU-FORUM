import { z } from 'zod';

/** Environment variables the API needs at boot. Extended as each phase adds services. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().startsWith('postgresql://'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).default(10),
  OTP_SECRET: z.string().min(32),
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(5),

  MAIL_DRIVER: z.enum(['smtp', 'memory']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  MAIL_FROM: z.string().default('EDU-FORUM <no-reply@edu-forum.local>'),
  SMS_DRIVER: z.enum(['console', 'memory']).default('console'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
