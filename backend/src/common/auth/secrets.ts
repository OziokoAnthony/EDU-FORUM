import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** URL-safe random token for links (email verification, password reset, refresh). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored as SHA-256 hashes, never in plain text. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function randomOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** OTPs are short, so they are keyed with a server secret and bound to the user. */
export function hashOtp(secret: string, userId: string, code: string): string {
  return createHmac('sha256', secret).update(`${userId}:${code}`).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
