import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, verify } from 'node:crypto';

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string; use?: string };
import { ApiException } from '../../common/filters/api-exception.filter';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
}

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const invalid = () => new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Google sign-in failed. Please try again.');
const b64 = (s: string) => Buffer.from(s, 'base64url');

/**
 * Checks the ID token from Google's sign-in button with Node's own crypto (no library): RS256
 * signature against Google's published keys (cached as Google says), issuer, audience (our client
 * ID), expiry and a verified email. GOOGLE_AUTH_DRIVER=memory accepts `test.<base64url claims>`
 * tokens for the API tests only.
 */
@Injectable()
export class GoogleVerifier {
  private keys: { at: number; maxAge: number; jwks: Jwk[] } | null = null;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return !!this.config.get<string>('GOOGLE_CLIENT_ID');
  }

  async verify(credential: string): Promise<GoogleIdentity> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', 'Google sign-in is not set up yet');
    const claims = this.config.get('GOOGLE_AUTH_DRIVER') === 'memory' ? this.testClaims(credential) : await this.checkSignature(credential);

    const now = Math.floor(Date.now() / 1000);
    if (!ISSUERS.includes(String(claims.iss)) || claims.aud !== clientId) throw invalid();
    if (typeof claims.exp !== 'number' || claims.exp < now - 60) throw invalid();
    if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') throw invalid();
    if (claims.email_verified !== true && claims.email_verified !== 'true') {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', 'Your Google email address is not verified');
    }
    return { sub: claims.sub, email: claims.email.toLowerCase(), name: typeof claims.name === 'string' ? claims.name : null };
  }

  private testClaims(credential: string): Record<string, unknown> {
    if (!credential.startsWith('test.')) throw invalid();
    try {
      return JSON.parse(b64(credential.slice(5)).toString('utf8')) as Record<string, unknown>;
    } catch {
      throw invalid();
    }
  }

  private async checkSignature(token: string): Promise<Record<string, unknown>> {
    const parts = token.split('.');
    if (parts.length !== 3) throw invalid();
    let header: { alg?: string; kid?: string };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(b64(parts[0]).toString('utf8'));
      claims = JSON.parse(b64(parts[1]).toString('utf8'));
    } catch {
      throw invalid();
    }
    if (header.alg !== 'RS256' || !header.kid) throw invalid();
    let jwk = (await this.jwks()).find((k) => k.kid === header.kid);
    // Google rotates keys: refetch once if the key is new to us.
    if (!jwk) jwk = (await this.jwks(true)).find((k) => k.kid === header.kid);
    if (!jwk) throw invalid();
    const ok = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), b64(parts[2]));
    if (!ok) throw invalid();
    return claims;
  }

  private async jwks(fresh = false): Promise<Jwk[]> {
    if (!fresh && this.keys && Date.now() - this.keys.at < this.keys.maxAge) return this.keys.jwks;
    const res = await fetch(CERTS_URL).catch(() => null);
    if (!res?.ok) {
      if (this.keys) return this.keys.jwks;
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, 'INTERNAL_ERROR', 'Google sign-in is unavailable right now. Try again shortly.');
    }
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600) * 1000;
    const body = (await res.json()) as { keys: Jwk[] };
    this.keys = { at: Date.now(), maxAge, jwks: body.keys };
    return body.keys;
  }
}
