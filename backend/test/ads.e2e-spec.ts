import { hash } from '@node-rs/argon2';
import { AD_SLOTS } from '@edu-forum/shared';
import { SeoNotifier } from '../src/modules/seo/seo-notifier';
import { createTestApp, deleteTestUsers, uniqueEmail, verifiedUser, type TestApp } from './utils';

describe('Ads (e2e)', () => {
  let t: TestApp;
  let adminAuth: string;
  // Tests share the local database: keep whatever ad settings were there and put them back.
  let saved: Awaited<ReturnType<TestApp['prisma']['adSettings']['findMany']>> = [];

  beforeAll(async () => {
    t = await createTestApp();
    const email = uniqueEmail('admin');
    await t.prisma.user.create({ data: { email, role: 'admin', passwordHash: await hash('admin2026x'), emailVerifiedAt: new Date() } });
    adminAuth = `Bearer ${(await t.http.post('/api/v1/auth/login').send({ identifier: email, password: 'admin2026x' }).expect(200)).body.accessToken}`;
    saved = await t.prisma.adSettings.findMany();
    await t.prisma.adSettings.deleteMany();
  });

  afterAll(async () => {
    await t.prisma.adSettings.deleteMany();
    if (saved.length) await t.prisma.adSettings.createMany({ data: saved });
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  it('every space starts off; an admin switches one on with its slot ID; public config lists only spaces that are on', async () => {
    expect((await t.http.get('/api/v1/ads/config').expect(200)).body).toEqual({ slots: [] });
    const list = await t.http.get('/api/v1/admin/ads').set('Authorization', adminAuth).expect(200);
    expect(list.body).toHaveLength(AD_SLOTS.length);
    expect(list.body.every((s: { enabled: boolean }) => !s.enabled)).toBe(true);

    // On needs a slot ID; unknown spaces are 404.
    await t.http.put('/api/v1/admin/ads/home/below_fold').set('Authorization', adminAuth).send({ enabled: true, slotId: null }).expect(400);
    await t.http.put('/api/v1/admin/ads/home/nowhere').set('Authorization', adminAuth).send({ enabled: false, slotId: null }).expect(404);

    const seo = t.app.get(SeoNotifier);
    const before = seo.revalidated.length;
    await t.http.put('/api/v1/admin/ads/home/below_fold').set('Authorization', adminAuth).send({ enabled: true, slotId: '1234567890' }).expect(200);
    await t.http.put('/api/v1/admin/ads/job_detail/sidebar').set('Authorization', adminAuth).send({ enabled: false, slotId: '9876543210' }).expect(200);
    expect(seo.revalidated.slice(before)).toContainEqual(['ads']);
    expect((await t.http.get('/api/v1/ads/config').expect(200)).body).toEqual({ slots: [{ pageType: 'home', slotName: 'below_fold', slotId: '1234567890' }] });
    expect(await t.prisma.auditLog.count({ where: { action: 'ads.update' } })).toBeGreaterThanOrEqual(2);

    const teacher = await verifiedUser(t);
    await t.http.get('/api/v1/admin/ads').set('Authorization', teacher.auth).expect(403);
  });
});
