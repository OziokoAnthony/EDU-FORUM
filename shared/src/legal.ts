import { z } from 'zod';

/**
 * Who runs the site, for the privacy policy, terms and contact page (NDPA 2023 needs the data
 * controller named). Placeholders until the user supplies them (user, 2026-11-01); the admin
 * overview lists any still unfilled. Edit here, then rebuild.
 */
export const LEGAL = {
  operatorName: '[Company name]',
  address: '[Registered business address]',
  email: '[support email address]',
  lastUpdated: '1 November 2026',
} as const;

/** Fields of LEGAL still holding a [placeholder]. */
export function legalPlaceholders(): string[] {
  return Object.entries(LEGAL)
    .filter(([, v]) => /^\[.*\]$/.test(v))
    .map(([k]) => k);
}

export const CONTACT_TOPICS = ['general', 'account', 'jobs', 'report', 'advertising', 'other'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];
export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  general: 'General question',
  account: 'My account or sign-in',
  jobs: 'Posting or applying for jobs',
  report: 'Report a scam or a safety problem',
  advertising: 'Advertising',
  other: 'Something else',
};
export const CONTACT_MESSAGE_MAX = 3000;
/** Per email address and per network, per hour (spam). */
export const CONTACT_HOURLY_LIMIT = 3;

/** POST /contact. `website` is a hidden field people never fill in (bots do). */
export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(100),
  email: z.email('Enter a valid email address').max(200),
  topic: z.enum(CONTACT_TOPICS, 'Choose a topic'),
  message: z
    .string()
    .trim()
    .min(20, 'Tell us a little more (at least 20 characters)')
    .max(CONTACT_MESSAGE_MAX, `Keep it under ${CONTACT_MESSAGE_MAX.toLocaleString('en-NG')} characters`)
    .refine((v) => !/(https?:\/\/|www\.)/i.test(v), 'Please remove links from your message'),
  website: z.string().max(0).optional().default(''),
});
export type ContactInput = z.input<typeof contactSchema>;

export const adminContactQuerySchema = z.object({
  status: z.enum(['open', 'closed']).default('open'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export interface AdminContactMessage {
  id: string;
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  status: 'open' | 'closed';
  /** Signed in when they wrote: their account role. */
  userRole: string | null;
  createdAt: string;
}
