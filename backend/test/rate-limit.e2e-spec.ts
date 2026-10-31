// PRD: rate limiting on auth (5 attempts/min). Must be set before the app module loads.
process.env.AUTH_RATE_LIMIT = '5';

import { createTestApp, uniqueEmail, type TestApp } from './utils';

describe('Auth rate limit (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(() => t.close());

  it('allows 5 login attempts per minute, then returns 429 RATE_LIMITED', async () => {
    const body = { identifier: uniqueEmail('nobody'), password: 'wrong1234' };
    for (let i = 0; i < 5; i++) {
      await t.http.post('/api/v1/auth/login').send(body).expect(401);
    }
    const res = await t.http.post('/api/v1/auth/login').send(body).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('does not rate-limit token refresh', async () => {
    for (let i = 0; i < 7; i++) {
      await t.http.post('/api/v1/auth/refresh').send({}).expect(401);
    }
  });
});
