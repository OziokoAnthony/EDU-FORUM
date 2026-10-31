import { createTestApp, deleteTestUsers, linkToken, refreshCookie, uniqueEmail, type TestApp } from './utils';

describe('/me (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  async function signUp(role: 'teacher' | 'school') {
    const email = uniqueEmail(role);
    const res = await t.http
      .post('/api/v1/auth/register')
      .send({ email, password: 'teach2026', role, consent: true })
      .expect(201);
    return { email, auth: `Bearer ${res.body.accessToken}`, cookie: refreshCookie(res) };
  }

  it('requires a valid access token', async () => {
    const res = await t.http.get('/api/v1/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    await t.http.get('/api/v1/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('PATCH /me: a new email must be verified again', async () => {
    const { email, auth } = await signUp('teacher');
    await t.http.post('/api/v1/auth/verify-email').send({ token: linkToken(t.mailer.lastTo(email)!.text) }).expect(200);

    const newEmail = uniqueEmail('changed');
    const res = await t.http.patch('/api/v1/me').set('Authorization', auth).send({ email: newEmail }).expect(200);
    expect(res.body).toMatchObject({ email: newEmail, emailVerified: false, verified: false });
    expect(t.mailer.lastTo(newEmail)?.text).toContain('/verify-email?token=');
  });

  it('PATCH /me: rejects an email that belongs to someone else', async () => {
    const a = await signUp('teacher');
    const b = await signUp('teacher');
    await t.http.patch('/api/v1/me').set('Authorization', b.auth).send({ email: a.email }).expect(409);
  });

  it('PATCH /me: merges notification settings', async () => {
    const { auth } = await signUp('teacher');
    await t.http.patch('/api/v1/me').set('Authorization', auth).send({ notificationSettings: { email: true } });
    const res = await t.http
      .patch('/api/v1/me')
      .set('Authorization', auth)
      .send({ notificationSettings: { sms: false } })
      .expect(200);
    expect(res.body.notificationSettings).toEqual({ email: true, sms: false });
  });

  it('DELETE /me schedules deletion in 30 days and signs out', async () => {
    const { auth, cookie } = await signUp('teacher');
    const res = await t.http.delete('/api/v1/me').set('Authorization', auth).expect(202);
    const days = (new Date(res.body.deletionScheduledFor).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    await t.http.post('/api/v1/auth/refresh').set('Cookie', cookie).send({}).expect(401);
  });

  it('GET /me/onboarding: teacher starts at verification, then personal details', async () => {
    const { email, auth } = await signUp('teacher');
    const before = await t.http.get('/api/v1/me/onboarding').set('Authorization', auth).expect(200);
    expect(before.body).toMatchObject({ role: 'teacher', verified: false, nextStep: 'verify', complete: false });
    expect(before.body.steps.map((s: { key: string }) => s.key)).toEqual([
      'verify', 'personal', 'location', 'qualifications', 'certifications', 'experience', 'preferences', 'cv', 'identification',
    ]);

    await t.http.post('/api/v1/auth/verify-email').send({ token: linkToken(t.mailer.lastTo(email)!.text) }).expect(200);
    const after = await t.http.get('/api/v1/me/onboarding').set('Authorization', auth).expect(200);
    expect(after.body).toMatchObject({ verified: true, nextStep: 'personal' });
  });

  it('GET /me/onboarding: school owner steps', async () => {
    const { auth } = await signUp('school');
    const res = await t.http.get('/api/v1/me/onboarding').set('Authorization', auth).expect(200);
    expect(res.body.steps.map((s: { key: string }) => s.key)).toEqual([
      'verify', 'details', 'location', 'contact', 'identification', 'team',
    ]);
  });
});
