import { hash } from '@node-rs/argon2';
import { createTestApp, deleteTestUsers, uniqueEmail, type TestApp } from './utils';

describe('Contact form (e2e)', () => {
  let t: TestApp;
  let adminAuth: string;
  const ids: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    const email = uniqueEmail('admin');
    await t.prisma.user.create({ data: { email, role: 'admin', passwordHash: await hash('admin2026x'), emailVerifiedAt: new Date() } });
    adminAuth = `Bearer ${(await t.http.post('/api/v1/auth/login').send({ identifier: email, password: 'admin2026x' }).expect(200)).body.accessToken}`;
  });

  afterAll(async () => {
    await t.prisma.contactMessage.deleteMany({ where: { email: { endsWith: 'e2e.edu-forum.test' } } });
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  const send = (body: Record<string, unknown>, status = 202, ip = '10.1.1.1') =>
    t.http.post('/api/v1/contact').set('X-Forwarded-For', ip).send({ name: 'Ada Visitor', topic: 'general', ...body }).expect(status);

  it('anyone can write; links, empty bots fields and floods are refused; admins read and close messages', async () => {
    const email = uniqueEmail('visitor');
    await send({ email, message: 'How do I post a vacancy for my school in Kano?' });
    // Same message again: accepted quietly, one copy kept.
    await send({ email, message: 'How do I post a vacancy for my school in Kano?' });
    expect(await t.prisma.contactMessage.count({ where: { email } })).toBe(1);

    const link = await send({ email, message: 'Visit https://spam.example for cheap deals now' }, 400);
    expect(link.body.error.details.issues[0].path).toBe('message');
    await send({ email, message: 'I am a bot filling every single field', website: 'http://x' }, 400);

    await send({ email, message: 'Second distinct question about my account' });
    await send({ email, message: 'Third distinct question about job alerts' });
    const flood = await send({ email, message: 'Fourth distinct question within the hour' }, 429);
    expect(flood.body.error.code).toBe('RATE_LIMITED');

    const list = await t.http.get('/api/v1/admin/contact-messages?limit=50').set('Authorization', adminAuth).expect(200);
    const mine = list.body.data.filter((m: { email: string }) => m.email === email);
    expect(mine).toHaveLength(3);
    expect(mine[0]).toMatchObject({ name: 'Ada Visitor', topic: 'general', status: 'open', userRole: null });
    ids.push(mine[0].id);
    await t.http.post(`/api/v1/admin/contact-messages/${mine[0].id}/close`).set('Authorization', adminAuth).expect(200);
    const closed = await t.http.get('/api/v1/admin/contact-messages?status=closed&limit=50').set('Authorization', adminAuth).expect(200);
    expect(closed.body.data.some((m: { id: string }) => m.id === mine[0].id)).toBe(true);
    await t.http.get('/api/v1/admin/contact-messages').expect(401);
  });
});
