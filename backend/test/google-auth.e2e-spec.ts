import { hash } from '@node-rs/argon2';
import { createTestApp, deleteTestUsers, uniqueEmail, verifiedUser, type TestApp } from './utils';

/** GOOGLE_AUTH_DRIVER=memory in tests: `test.<base64url claims>` stands in for Google's signed token. */
const token = (claims: Record<string, unknown>) =>
  `test.${Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'test-client.apps.googleusercontent.com', exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, ...claims })).toString('base64url')}`;

describe('Continue with Google (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  const google = (body: Record<string, unknown>, status = 200) => t.http.post('/api/v1/auth/google').send(body).expect(status);

  it('a new Google user picks a role once; next time they are signed straight in, already verified', async () => {
    const email = uniqueEmail('gnew');
    const sub = `g-${Date.now()}`;
    const first = await google({ credential: token({ sub, email, name: 'Kemi Google' }) }, 422);
    expect(first.body.error.details).toEqual({ signupRequired: true, email, name: 'Kemi Google' });
    // Role without consent is not enough.
    await google({ credential: token({ sub, email }), role: 'teacher' }, 422);

    const created = await google({ credential: token({ sub, email }), role: 'teacher', consent: true });
    expect(created.body.user).toMatchObject({ email, role: 'teacher', verified: true, emailVerified: true });
    expect(created.headers['set-cookie']?.[0]).toMatch(/^ef_rt=/);
    const again = await google({ credential: token({ sub, email }) });
    expect(again.body.user.id).toBe(created.body.user.id);
    await t.http.get('/api/v1/me').set('Authorization', `Bearer ${again.body.accessToken}`).expect(200);
  });

  it('an existing account with the same email is linked, not duplicated; admins and suspended users are refused', async () => {
    const existing = await verifiedUser(t, 'director');
    const res = await google({ credential: token({ sub: `g-link-${Date.now()}`, email: existing.email }) });
    expect(res.body.user).toMatchObject({ id: existing.userId, role: 'director' });
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: existing.userId } })).googleId).toMatch(/^g-link-/);

    const adminEmail = uniqueEmail('gadmin');
    await t.prisma.user.create({ data: { email: adminEmail, role: 'admin', passwordHash: await hash('admin2026x'), emailVerifiedAt: new Date() } });
    await google({ credential: token({ sub: `g-admin-${Date.now()}`, email: adminEmail }) }, 403);

    await t.prisma.user.update({ where: { id: existing.userId }, data: { status: 'suspended' } });
    await google({ credential: token({ sub: 'whatever', email: existing.email }) }, 403);
  });

  it('rejects tokens for another app, expired tokens and unverified emails', async () => {
    const email = uniqueEmail('gbad');
    await google({ credential: token({ sub: 'x1', email, aud: 'someone-else.apps.googleusercontent.com' }) }, 401);
    await google({ credential: token({ sub: 'x2', email, exp: Math.floor(Date.now() / 1000) - 3600 }) }, 401);
    await google({ credential: token({ sub: 'x3', email, email_verified: false }) }, 422);
    await google({ credential: 'not-a-real-google-token-at-all' }, 401);
  });
});
