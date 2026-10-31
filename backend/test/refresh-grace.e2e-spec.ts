import type { TestApp } from './utils';

/**
 * Refresh-token reuse inside the grace window (two tabs, or a reload while a refresh is in
 * flight). The window is read at boot, so the app is loaded only after it is set.
 */
describe('Refresh token grace window (e2e)', () => {
  let t: TestApp;
  let utils: typeof import('./utils');

  beforeAll(async () => {
    process.env.REFRESH_REUSE_GRACE_SECONDS = '10';
    utils = await import('./utils');
    t = await utils.createTestApp();
  });

  afterAll(async () => {
    await utils.deleteTestUsers(t.prisma);
    await t.close();
  });

  it('a token re-presented within the window gets its own new session, not a sign-out', async () => {
    const email = utils.uniqueEmail('grace');
    const reg = await t.http.post('/api/v1/auth/register').send({ email, password: 'teach2026', role: 'teacher', consent: true }).expect(201);
    const original = utils.refreshCookie(reg);

    const first = await t.http.post('/api/v1/auth/refresh').set('Cookie', original).send({}).expect(200);
    const second = await t.http.post('/api/v1/auth/refresh').set('Cookie', original).send({}).expect(200);
    expect(second.body.accessToken).toEqual(expect.any(String));

    // Both new tokens keep working: neither client was signed out.
    await t.http.post('/api/v1/auth/refresh').set('Cookie', utils.refreshCookie(first)).send({}).expect(200);
    await t.http.post('/api/v1/auth/refresh').set('Cookie', utils.refreshCookie(second)).send({}).expect(200);
  });

  it('outside the window, reuse still revokes the whole family', async () => {
    const email = utils.uniqueEmail('grace-old');
    const reg = await t.http.post('/api/v1/auth/register').send({ email, password: 'teach2026', role: 'teacher', consent: true }).expect(201);
    const original = utils.refreshCookie(reg);
    const rotated = await t.http.post('/api/v1/auth/refresh').set('Cookie', original).send({}).expect(200);
    await t.prisma.refreshToken.updateMany({ where: { user: { email }, replacedBy: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });

    await t.http.post('/api/v1/auth/refresh').set('Cookie', original).send({}).expect(401);
    await t.http.post('/api/v1/auth/refresh').set('Cookie', utils.refreshCookie(rotated)).send({}).expect(401);
  });
});
