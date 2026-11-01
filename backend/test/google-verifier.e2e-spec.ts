import type { ConfigService } from '@nestjs/config';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { GoogleVerifier } from '../src/modules/auth/google-verifier';

/** The real RS256 path, against a key we generate and serve as "Google's" published keys. */
describe('GoogleVerifier signature check', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' };
  const config = { get: (k: string) => ({ GOOGLE_CLIENT_ID: 'app.apps.googleusercontent.com', GOOGLE_AUTH_DRIVER: 'google' })[k] } as unknown as ConfigService;
  const realFetch = global.fetch;

  const sign = (claims: Record<string, unknown>, key = privateKey, kid = 'key-1') => {
    const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ iss: 'https://accounts.google.com', aud: 'app.apps.googleusercontent.com', exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, ...claims }),
    ).toString('base64url');
    const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key).toString('base64url');
    return `${head}.${body}.${sig}`;
  };

  beforeAll(() => {
    global.fetch = (async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'public, max-age=3600' } })) as typeof fetch;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  it('accepts a correctly signed token and reads the identity', async () => {
    const v = new GoogleVerifier(config);
    await expect(v.verify(sign({ sub: '123', email: 'Ada@Example.com', name: 'Ada' }))).resolves.toEqual({ sub: '123', email: 'ada@example.com', name: 'Ada' });
  });

  it('rejects a token signed by another key, a tampered token and an unknown key id', async () => {
    const v = new GoogleVerifier(config);
    await expect(v.verify(sign({ sub: '1', email: 'a@b.c' }, other.privateKey))).rejects.toMatchObject({ status: 401 });
    const good = sign({ sub: '1', email: 'a@b.c' });
    const [h, , s] = good.split('.');
    const forged = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'app.apps.googleusercontent.com', exp: 9999999999, email_verified: true, sub: 'admin', email: 'x@y.z' })).toString('base64url');
    await expect(v.verify(`${h}.${forged}.${s}`)).rejects.toMatchObject({ status: 401 });
    await expect(v.verify(sign({ sub: '1', email: 'a@b.c' }, privateKey, 'key-unknown'))).rejects.toMatchObject({ status: 401 });
  });
});
