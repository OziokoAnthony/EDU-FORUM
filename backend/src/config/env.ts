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
  /** Google sign-in: the OAuth client ID (…apps.googleusercontent.com). Off when empty; "memory" in tests. */
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_AUTH_DRIVER: z.enum(['google', 'memory']).default('google'),

  MAIL_DRIVER: z.enum(['smtp', 'resend', 'memory']).default('smtp'),
  /** Resend (production email); used when MAIL_DRIVER=resend. */
  RESEND_API_KEY: z.string().default(''),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  MAIL_FROM: z.string().default('EDU-FORUM <no-reply@edu-forum.local>'),
  /** Where contact-form messages are emailed (they are always kept for admins too). */
  SUPPORT_EMAIL: z.string().default(''),
  /** Contact messages per email address and per network per hour (raised for browser tests). */
  CONTACT_RATE_LIMIT: z.coerce.number().int().positive().default(3),
  SMS_DRIVER: z.enum(['console', 'termii', 'memory']).default('console'),
  /** Termii (production SMS / WhatsApp); used when SMS_DRIVER=termii. */
  TERMII_API_KEY: z.string().default(''),
  TERMII_SENDER_ID: z.string().default('EDUFORUM'),
  TERMII_BASE_URL: z.string().default('https://api.ng.termii.com'),
  TERMII_SMS_ROUTE: z.enum(['dnd', 'generic']).default('dnd'),
  /** true once Termii has approved a WhatsApp sender for this account. */
  TERMII_WHATSAPP: z.enum(['true', 'false']).default('false'),
  // Push alerts to phones and browsers (web push). Off until VAPID keys exist; memory in tests.
  PUSH_DRIVER: z.enum(['webpush', 'memory', 'off']).default('off'),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@edu-forum.local'),

  // Background jobs (virus scan, DOC→PDF, purges). "inline" runs a job inside the request (tests).
  QUEUE_DRIVER: z.enum(['bullmq', 'inline']).default('bullmq'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Backblaze B2 through its S3-compatible API. "memory" keeps files in RAM (tests).
  STORAGE_DRIVER: z.enum(['s3', 'memory']).default('s3'),
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default(''),
  S3_BUCKET: z.string().default(''),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  SCANNER_DRIVER: z.enum(['clamav', 'memory']).default('clamav'),
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  /** Shared secret for POST /webhooks/storage/scan-result; the webhook is off when empty. */
  SCAN_WEBHOOK_SECRET: z.string().default(''),

  CONVERTER_DRIVER: z.enum(['gotenberg', 'memory']).default('gotenberg'),
  GOTENBERG_URL: z.string().default('http://localhost:3100'),

  GEOCODER_DRIVER: z.enum(['stub', 'google']).default('stub'),
  GOOGLE_MAPS_API_KEY: z.string().default(''),

  // SEO: on-demand revalidation of the web app's cached pages (off when empty) and the Google
  // Indexing API (a logger until production credentials exist; memory in tests).
  REVALIDATE_SECRET: z.string().default(''),
  INDEXING_DRIVER: z.enum(['log', 'memory']).default('log'),
}).superRefine((v, ctx) => {
  if (v.MAIL_DRIVER === 'resend' && !v.RESEND_API_KEY) ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'Required when MAIL_DRIVER=resend' });
  if (v.SMS_DRIVER === 'termii' && !v.TERMII_API_KEY) ctx.addIssue({ code: 'custom', path: ['TERMII_API_KEY'], message: 'Required when SMS_DRIVER=termii' });
  if (v.GEOCODER_DRIVER === 'google' && !v.GOOGLE_MAPS_API_KEY) ctx.addIssue({ code: 'custom', path: ['GOOGLE_MAPS_API_KEY'], message: 'Required when GEOCODER_DRIVER=google' });
  if (v.STORAGE_DRIVER !== 's3') return;
  for (const key of ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const) {
    if (!v[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Required when STORAGE_DRIVER=s3' });
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
