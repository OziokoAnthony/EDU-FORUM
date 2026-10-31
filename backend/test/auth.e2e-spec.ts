import {
  createTestApp,
  deleteTestUsers,
  linkToken,
  otpCode,
  refreshCookie,
  uniqueEmail,
  uniquePhone,
  type TestApp,
} from './utils';

const PASSWORD = 'teach2026';

describe('Auth (e2e)', () => {
  let t: TestApp;
  const phones: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma, phones);
    await t.close();
  });

  async function registerEmail(role: 'teacher' | 'principal' | 'director' = 'teacher') {
    const email = uniqueEmail(role);
    const res = await t.http
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, role, consent: true })
      .expect(201);
    return { email, res };
  }

  describe('register', () => {
    it('creates an unverified account, signs in and sends a verification email', async () => {
      const { email, res } = await registerEmail();
      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        expiresIn: 900,
        user: { email, role: 'teacher', verified: false, emailVerified: false },
      });
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('ef_rt='));
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(t.mailer.lastTo(email)?.text).toContain('/verify-email?token=');
    });

    it('signs up principals and directors with their own role', async () => {
      expect((await registerEmail('principal')).res.body.user.role).toBe('principal');
      expect((await registerEmail('director')).res.body.user.role).toBe('director');
    });

    it('rejects a duplicate email with 409', async () => {
      const { email } = await registerEmail();
      const res = await t.http
        .post('/api/v1/auth/register')
        .send({ email: email.toUpperCase(), password: PASSWORD, role: 'teacher', consent: true })
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('validates input with the shared schema (400 + issues)', async () => {
      const res = await t.http
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'short', role: 'admin', consent: false })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const paths = res.body.error.details.issues.map((i: { path: string }) => i.path);
      expect(paths).toEqual(expect.arrayContaining(['email', 'password', 'role', 'consent']));
    });

    it('never lets sign-up create an admin', async () => {
      await t.http
        .post('/api/v1/auth/register')
        .send({ email: uniqueEmail(), password: PASSWORD, role: 'admin', consent: true })
        .expect(400);
    });
  });

  describe('email verification', () => {
    it('verifies with the emailed link; the link works only once', async () => {
      const { email, res } = await registerEmail();
      const token = linkToken(t.mailer.lastTo(email)!.text);
      await t.http.post('/api/v1/auth/verify-email').send({ token }).expect(200);
      await t.http.post('/api/v1/auth/verify-email').send({ token }).expect(400);

      const me = await t.http.get('/api/v1/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
      expect(me.body).toMatchObject({ emailVerified: true, verified: true });
    });

    it('resend invalidates the previous link', async () => {
      const { email } = await registerEmail();
      const first = linkToken(t.mailer.lastTo(email)!.text);
      await t.http.post('/api/v1/auth/resend-verification').send({ identifier: email }).expect(200);
      const second = linkToken(t.mailer.lastTo(email)!.text);
      expect(second).not.toBe(first);
      await t.http.post('/api/v1/auth/verify-email').send({ token: first }).expect(400);
      await t.http.post('/api/v1/auth/verify-email').send({ token: second }).expect(200);
    });

    it('resend does not reveal whether an account exists', async () => {
      await t.http.post('/api/v1/auth/resend-verification').send({ identifier: uniqueEmail('nobody') }).expect(200);
    });
  });

  describe('phone sign-up + OTP', () => {
    it('sends an OTP, rejects wrong codes and locks after 5 attempts', async () => {
      const phone = uniquePhone();
      phones.push(phone.e164);
      const res = await t.http
        .post('/api/v1/auth/register')
        .send({ phone: phone.local, password: PASSWORD, role: 'teacher', consent: true })
        .expect(201);
      expect(res.body.user.phone).toBe(phone.e164);

      const code = otpCode(t.sms.lastTo(phone.e164)!.text);
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        await t.http.post('/api/v1/auth/verify-phone').send({ phone: phone.local, code: wrong }).expect(400);
      }
      // Locked: even the right code fails until a new one is sent.
      await t.http.post('/api/v1/auth/verify-phone').send({ phone: phone.local, code }).expect(400);

      await t.http.post('/api/v1/auth/resend-verification').send({ identifier: phone.local }).expect(200);
      const fresh = otpCode(t.sms.lastTo(phone.e164)!.text);
      await t.http.post('/api/v1/auth/verify-phone').send({ phone: phone.e164, code: fresh }).expect(200);

      const login = await t.http
        .post('/api/v1/auth/login')
        .send({ identifier: phone.local, password: PASSWORD })
        .expect(200);
      expect(login.body.user).toMatchObject({ phoneVerified: true, verified: true });
    });
  });

  describe('login', () => {
    it('accepts the right password, rejects the wrong one with a generic message', async () => {
      const { email } = await registerEmail();
      const bad = await t.http.post('/api/v1/auth/login').send({ identifier: email, password: 'wrong1234' }).expect(401);
      const unknown = await t.http
        .post('/api/v1/auth/login')
        .send({ identifier: uniqueEmail('nobody'), password: PASSWORD })
        .expect(401);
      expect(bad.body.error.message).toBe(unknown.body.error.message);
      await t.http.post('/api/v1/auth/login').send({ identifier: email, password: PASSWORD }).expect(200);
    });

    it('blocks suspended accounts', async () => {
      const { email } = await registerEmail();
      await t.prisma.user.update({ where: { email }, data: { status: 'suspended' } });
      const res = await t.http.post('/api/v1/auth/login').send({ identifier: email, password: PASSWORD }).expect(403);
      expect(res.body.error.message).toMatch(/suspended/);
    });

    it('a suspended user loses access immediately, even with a valid access token', async () => {
      const { email, res } = await registerEmail();
      await t.prisma.user.update({ where: { email }, data: { status: 'suspended' } });
      await t.http.get('/api/v1/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(403);
    });
  });

  describe('refresh token rotation', () => {
    it('rotates on every refresh', async () => {
      const { res } = await registerEmail();
      const c1 = refreshCookie(res);
      const r1 = await t.http.post('/api/v1/auth/refresh').set('Cookie', c1).send({}).expect(200);
      expect(r1.body.accessToken).toEqual(expect.any(String));
      const c2 = refreshCookie(r1);
      expect(c2).not.toBe(c1);
      await t.http.post('/api/v1/auth/refresh').set('Cookie', c2).send({}).expect(200);
    });

    it('re-using a rotated token revokes the whole family (theft detection)', async () => {
      const { res } = await registerEmail();
      const c1 = refreshCookie(res);
      const r1 = await t.http.post('/api/v1/auth/refresh').set('Cookie', c1).send({}).expect(200);
      const c2 = refreshCookie(r1);

      await t.http.post('/api/v1/auth/refresh').set('Cookie', c1).send({}).expect(401);
      // The legitimate newer token is now revoked too.
      await t.http.post('/api/v1/auth/refresh').set('Cookie', c2).send({}).expect(401);
    });

    it('accepts the token in the body for non-browser clients', async () => {
      const { res } = await registerEmail();
      const token = refreshCookie(res).slice('ef_rt='.length);
      await t.http.post('/api/v1/auth/refresh').send({ refreshToken: token }).expect(200);
    });

    it('logout revokes the refresh token', async () => {
      const { res } = await registerEmail();
      const cookie = refreshCookie(res);
      await t.http
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .set('Cookie', cookie)
        .send({})
        .expect(204);
      await t.http.post('/api/v1/auth/refresh').set('Cookie', cookie).send({}).expect(401);
    });
  });

  describe('password reset', () => {
    it('emails a reset link, sets the new password and signs out everywhere', async () => {
      const { email, res } = await registerEmail();
      const cookie = refreshCookie(res);
      await t.http.post('/api/v1/auth/forgot-password').send({ identifier: email }).expect(200);
      const token = linkToken(t.mailer.lastTo(email)!.text);
      expect(t.mailer.lastTo(email)!.text).toContain('/reset-password?token=');

      await t.http.post('/api/v1/auth/reset-password').send({ token, password: 'newpass99' }).expect(200);
      await t.http.post('/api/v1/auth/refresh').set('Cookie', cookie).send({}).expect(401);
      await t.http.post('/api/v1/auth/login').send({ identifier: email, password: PASSWORD }).expect(401);
      const login = await t.http
        .post('/api/v1/auth/login')
        .send({ identifier: email, password: 'newpass99' })
        .expect(200);
      // The emailed link proved the address.
      expect(login.body.user.emailVerified).toBe(true);
    });

    it('resets by SMS code for phone accounts', async () => {
      const phone = uniquePhone();
      phones.push(phone.e164);
      await t.http
        .post('/api/v1/auth/register')
        .send({ phone: phone.local, password: PASSWORD, role: 'teacher', consent: true })
        .expect(201);
      await t.http.post('/api/v1/auth/forgot-password').send({ identifier: phone.local }).expect(200);
      const code = otpCode(t.sms.lastTo(phone.e164)!.text);
      await t.http
        .post('/api/v1/auth/reset-password')
        .send({ phone: phone.local, code, password: 'newpass99' })
        .expect(200);
      await t.http.post('/api/v1/auth/login').send({ identifier: phone.e164, password: 'newpass99' }).expect(200);
    });

    it('does not reveal unknown accounts', async () => {
      await t.http.post('/api/v1/auth/forgot-password').send({ identifier: uniqueEmail('nobody') }).expect(200);
    });
  });

  describe('change password', () => {
    it('needs the current password and signs out other sessions', async () => {
      const { email, res } = await registerEmail();
      const auth = `Bearer ${res.body.accessToken}`;
      const otherDevice = refreshCookie(res);

      await t.http
        .post('/api/v1/auth/change-password')
        .set('Authorization', auth)
        .send({ currentPassword: 'wrong1234', newPassword: 'newpass99' })
        .expect(400);
      const ok = await t.http
        .post('/api/v1/auth/change-password')
        .set('Authorization', auth)
        .send({ currentPassword: PASSWORD, newPassword: 'newpass99' })
        .expect(200);

      await t.http.post('/api/v1/auth/refresh').set('Cookie', otherDevice).send({}).expect(401);
      await t.http.post('/api/v1/auth/refresh').set('Cookie', refreshCookie(ok)).send({}).expect(200);
      await t.http.post('/api/v1/auth/login').send({ identifier: email, password: 'newpass99' }).expect(200);
    });
  });
});
