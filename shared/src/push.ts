import { z } from 'zod';

/** POST /me/push-subscriptions — the browser's PushSubscription.toJSON(). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});
export type PushSubscriptionInput = z.input<typeof pushSubscriptionSchema>;

/** DELETE /me/push-subscriptions */
export const pushUnsubscribeSchema = z.object({ endpoint: z.url().max(1000) });

/** GET /push/public-key — null when push alerts are not set up on this server. */
export interface PushPublicKeyResponse {
  publicKey: string | null;
}

/** What the service worker receives. */
export interface PushPayload {
  title: string;
  body: string;
  link: string | null;
  tag?: string;
}
