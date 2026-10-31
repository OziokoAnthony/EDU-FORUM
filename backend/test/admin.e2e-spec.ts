import { hash } from '@node-rs/argon2';
import { createTestApp, deleteTestUsers, uniqueEmail, verifiedUser, type SignedInUser, type TestApp } from './utils';

const LONG = 'We are looking for a committed Physics teacher to plan lessons, mark scripts, prepare students for WAEC and NECO, and run the science laboratory.';

describe('Admin and reports (e2e)', () => {
  let t: TestApp;
  let admin: SignedInUser;
  let lagos: { id: string };
  let ikeja: { id: string };

  beforeAll(async () => {
    t = await createTestApp();
    lagos = await t.prisma.state.findUniqueOrThrow({ where: { slug: 'lagos' } });
    ikeja = await t.prisma.lga.findFirstOrThrow({ where: { stateId: lagos.id, slug: 'ikeja' } });
    const email = uniqueEmail('admin');
    const user = await t.prisma.user.create({
      data: { email, role: 'admin', passwordHash: await hash('admin2026x'), emailVerifiedAt: new Date() },
    });
    const res = await t.http.post('/api/v1/auth/login').send({ identifier: email, password: 'admin2026x' }).expect(200);
    admin = { email, userId: user.id, auth: `Bearer ${res.body.accessToken}` };
  });

  afterAll(async () => {
    const ids = (await t.prisma.user.findMany({ where: { email: { endsWith: '@e2e.edu-forum.test' } }, select: { id: true } })).map((u) => u.id);
    await t.prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await t.prisma.report.deleteMany({ where: { OR: [{ reporterId: { in: ids } }, { resolvedById: { in: ids } }] } });
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  async function vacancy(by: SignedInUser, over: Record<string, unknown> = {}) {
    const res = await t.http
      .post('/api/v1/vacancies')
      .set('Authorization', by.auth)
      .send({
        title: 'SS2 Physics Teacher',
        subjects: ['physics'],
        levels: ['sss'],
        jobType: 'full_time',
        salaryMin: 150_000,
        salaryMax: 220_000,
        description: `<p>${LONG}</p>`,
        schoolName: 'Greenfield Academy',
        stateId: lagos.id,
        lgaId: ikeja.id,
        publish: true,
        ...over,
      })
      .expect(201);
    return res.body as { id: string };
  }

  async function publishedTeacher() {
    const user = await verifiedUser(t, 'teacher');
    const profile = await t.prisma.teacherProfile.create({
      data: { userId: user.userId, fullName: 'Ada Okafor', subjects: ['physics'], levels: ['sss'], stateId: lagos.id, lgaId: ikeja.id, isPublished: true },
    });
    return { ...user, profileId: profile.id };
  }

  it('only admins reach /admin', async () => {
    for (const role of ['teacher', 'principal', 'director'] as const) {
      const u = await verifiedUser(t, role);
      await t.http.get('/api/v1/admin/stats').set('Authorization', u.auth).expect(403);
    }
    await t.http.get('/api/v1/admin/stats').expect(401);
    const stats = await t.http.get('/api/v1/admin/stats').set('Authorization', admin.auth).expect(200);
    expect(stats.body).toMatchObject({ users: expect.any(Object), vacancies: expect.any(Object), reports: { open: expect.any(Number) } });
  });

  it('suspend signs the user out and hides their vacancies; reinstate restores; both audited', async () => {
    const director = await verifiedUser(t, 'director');
    const v = await vacancy(director);
    await t.http.get(`/api/v1/vacancies/${v.id}`).expect(200);

    await t.http.post(`/api/v1/admin/users/${director.userId}/suspend`).set('Authorization', admin.auth).send({ reason: '' }).expect(400);
    const res = await t.http.post(`/api/v1/admin/users/${director.userId}/suspend`).set('Authorization', admin.auth).send({ reason: 'Fake job adverts' }).expect(200);
    expect(res.body).toMatchObject({ status: 'suspended', suspendedReason: 'Fake job adverts', vacancies: { total: 1, live: 1 } });
    expect(t.mailer.lastTo(director.email)?.subject).toMatch(/suspended/);

    await t.http.get('/api/v1/me').set('Authorization', director.auth).expect(403);
    await t.http.get(`/api/v1/vacancies/${v.id}`).expect(404);
    const search = await t.http.get('/api/v1/vacancies?q=Physics&limit=50').expect(200);
    expect(search.body.data.map((x: { id: string }) => x.id)).not.toContain(v.id);

    await t.http.post(`/api/v1/admin/users/${director.userId}/reinstate`).set('Authorization', admin.auth).expect(200);
    await t.http.get(`/api/v1/vacancies/${v.id}`).expect(200);
    await t.http.post(`/api/v1/admin/users/${admin.userId}/suspend`).set('Authorization', admin.auth).send({ reason: 'Testing self' }).expect(422);

    const audit = await t.http.get(`/api/v1/admin/audit-logs?targetId=${director.userId}`).set('Authorization', admin.auth).expect(200);
    expect(audit.body.data.map((a: { action: string }) => a.action)).toEqual(['user.reinstate', 'user.suspend']);
    expect(audit.body.data[1]).toMatchObject({ metadata: { reason: 'Fake job adverts' }, actor: { id: admin.userId } });
  });

  it('users search by email and role', async () => {
    const teacher = await verifiedUser(t, 'teacher');
    const res = await t.http.get(`/api/v1/admin/users?q=${encodeURIComponent(teacher.email)}&role=teacher`).set('Authorization', admin.auth).expect(200);
    expect(res.body.data).toEqual([expect.objectContaining({ id: teacher.userId, role: 'teacher', verified: true })]);
    const detail = await t.http.get(`/api/v1/admin/users/${teacher.userId}`).set('Authorization', admin.auth).expect(200);
    expect(detail.body).toMatchObject({ email: teacher.email, teacherProfile: null, applications: 0 });
  });

  it('takedown closes a vacancy for good and emails the poster', async () => {
    const director = await verifiedUser(t, 'director');
    const v = await vacancy(director);
    const res = await t.http.post(`/api/v1/admin/vacancies/${v.id}/takedown`).set('Authorization', admin.auth).send({ reason: 'Asks applicants for money' }).expect(200);
    expect(res.body).toMatchObject({ status: 'closed', takedownReason: 'Asks applicants for money' });
    expect(t.mailer.lastTo(director.email)?.text).toContain('Asks applicants for money');
    await t.http.get(`/api/v1/vacancies/${v.id}`).expect(404);
    await t.http.post(`/api/v1/vacancies/${v.id}/publish`).set('Authorization', director.auth).expect(422);
    const list = await t.http.get('/api/v1/admin/vacancies?takenDown=true&q=Physics').set('Authorization', admin.auth).expect(200);
    expect(list.body.data.map((x: { id: string }) => x.id)).toContain(v.id);
    await t.http.post(`/api/v1/admin/vacancies/${v.id}/takedown`).set('Authorization', admin.auth).send({ reason: 'Again please' }).expect(422);
  });

  it('unpublish hides a teacher; they cannot republish until restored', async () => {
    const teacher = await publishedTeacher();
    await t.http.post(`/api/v1/admin/teachers/${teacher.profileId}/unpublish`).set('Authorization', admin.auth).send({ reason: 'Fake qualifications' }).expect(200);
    expect(t.mailer.lastTo(teacher.email)?.text).toContain('Fake qualifications');
    const blocked = await t.http.post('/api/v1/teachers/me/publish').set('Authorization', teacher.auth).expect(422);
    expect(blocked.body.error).toMatchObject({ message: expect.stringContaining('Fake qualifications'), details: { reason: 'HIDDEN_BY_ADMIN' } });
    const hidden = await t.http.get('/api/v1/admin/teachers?hidden=true&q=Ada').set('Authorization', admin.auth).expect(200);
    expect(hidden.body.data.map((x: { id: string }) => x.id)).toContain(teacher.profileId);

    await t.http.post(`/api/v1/admin/teachers/${teacher.profileId}/restore`).set('Authorization', admin.auth).expect(200);
    // Restored: publish now only depends on completeness again.
    const again = await t.http.post('/api/v1/teachers/me/publish').set('Authorization', teacher.auth).expect(422);
    expect(again.body.error.details.missing).toBeDefined();
  });

  describe('reports', () => {
    it('anyone signed in reports a vacancy or profile; not their own; not twice', async () => {
      const director = await verifiedUser(t, 'director');
      const v = await vacancy(director);
      const teacher = await publishedTeacher();

      await t.http.post('/api/v1/reports').send({ targetType: 'vacancy', targetId: v.id, reason: 'spam' }).expect(401);
      const r = await t.http.post('/api/v1/reports').set('Authorization', teacher.auth).send({ targetType: 'vacancy', targetId: v.id, reason: 'scam_or_fraud', details: 'Asked me to pay ₦5,000' }).expect(201);
      await t.http.post('/api/v1/reports').set('Authorization', teacher.auth).send({ targetType: 'vacancy', targetId: v.id, reason: 'spam' }).expect(409);
      await t.http.post('/api/v1/reports').set('Authorization', director.auth).send({ targetType: 'vacancy', targetId: v.id, reason: 'spam' }).expect(422);
      await t.http.post('/api/v1/reports').set('Authorization', director.auth).send({ targetType: 'teacher_profile', targetId: teacher.profileId, reason: 'fake_or_misleading' }).expect(201);
      await t.http.post('/api/v1/reports').set('Authorization', director.auth).send({ targetType: 'vacancy', targetId: crypto.randomUUID(), reason: 'spam' }).expect(404);
      await t.http.post('/api/v1/reports').set('Authorization', director.auth).send({ targetType: 'school', targetId: v.id, reason: 'spam' }).expect(400);

      const queue = await t.http.get('/api/v1/admin/reports?status=open&targetType=vacancy').set('Authorization', admin.auth).expect(200);
      const item = queue.body.data.find((x: { id: string }) => x.id === r.body.id);
      expect(item).toMatchObject({ targetLabel: 'SS2 Physics Teacher', reason: 'scam_or_fraud', details: 'Asked me to pay ₦5,000', openOnTarget: 1, reporter: { id: teacher.userId } });

      await t.http.patch(`/api/v1/admin/reports/${r.body.id}`).set('Authorization', admin.auth).send({ status: 'resolved', resolution: 'Vacancy taken down' }).expect(200);
      await t.http.patch(`/api/v1/admin/reports/${r.body.id}`).set('Authorization', admin.auth).send({ status: 'dismissed', resolution: 'Changed mind' }).expect(422);
      const done = await t.http.get('/api/v1/admin/reports?status=resolved').set('Authorization', admin.auth).expect(200);
      expect(done.body.data.map((x: { id: string }) => x.id)).toContain(r.body.id);
    });
  });

  describe('reference data', () => {
    it('add, edit (slug kept) and remove (deactivate) a subject; duplicates rejected', async () => {
      const name = `Robotics ${Date.now()}`;
      const created = await t.http.post('/api/v1/admin/meta/subjects').set('Authorization', admin.auth).send({ name }).expect(201);
      expect(created.body.slug).toMatch(/^robotics-\d+$/);
      await t.http.post('/api/v1/admin/meta/subjects').set('Authorization', admin.auth).send({ name }).expect(409);
      let list = await t.http.get('/api/v1/meta/subjects').expect(200);
      expect(list.body.data.map((s: { slug: string }) => s.slug)).toContain(created.body.slug);

      const edited = await t.http.patch(`/api/v1/admin/meta/subjects/${created.body.id}`).set('Authorization', admin.auth).send({ name: `${name} and Coding` }).expect(200);
      expect(edited.body).toMatchObject({ name: `${name} and Coding`, slug: created.body.slug });

      await t.http.delete(`/api/v1/admin/meta/subjects/${created.body.id}`).set('Authorization', admin.auth).expect(204);
      list = await t.http.get('/api/v1/meta/subjects').expect(200);
      expect(list.body.data.map((s: { slug: string }) => s.slug)).not.toContain(created.body.slug);
      await t.http.patch(`/api/v1/admin/meta/subjects/${crypto.randomUUID()}`).set('Authorization', admin.auth).send({ name: 'Nope nope' }).expect(404);
      await t.http.post('/api/v1/admin/meta/colours').set('Authorization', admin.auth).send({ name: 'Blue' }).expect(400);
      await t.prisma.subject.delete({ where: { id: created.body.id } });
    });

    it('an LGA needs its state', async () => {
      await t.http.post('/api/v1/admin/meta/lgas').set('Authorization', admin.auth).send({ name: 'New Town' }).expect(400);
      const lga = await t.http.post('/api/v1/admin/meta/lgas').set('Authorization', admin.auth).send({ name: `New Town ${Date.now()}`, stateId: lagos.id }).expect(201);
      await t.prisma.lga.delete({ where: { id: lga.body.id } });
    });
  });
});
