import { createTestApp, deleteTestUsers, linkToken, PNG, uniqueEmail, uploadFile, verifiedUser, type SignedInUser, type TestApp } from './utils';

const API = '/api/v1/schools';
const ME = `${API}/me`;

describe('School onboarding + team (e2e)', () => {
  let t: TestApp;
  let lagos: { id: string };
  let ikeja: { id: string };
  let oyoLga: { id: string };

  beforeAll(async () => {
    t = await createTestApp();
    lagos = await t.prisma.state.findUniqueOrThrow({ where: { slug: 'lagos' } });
    ikeja = await t.prisma.lga.findFirstOrThrow({ where: { stateId: lagos.id, slug: 'ikeja' } });
    oyoLga = await t.prisma.lga.findFirstOrThrow({ where: { state: { slug: 'oyo' } } });
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  const details = { name: 'Greenfield Academy', type: 'secondary', ownership: 'private', curriculum: ['nigerian', 'british'] };

  async function owner(): Promise<SignedInUser & { schoolId: string }> {
    const user = await verifiedUser(t, 'school');
    const res = await t.http.post(API).set('Authorization', user.auth).send(details).expect(201);
    return { ...user, schoolId: res.body.id };
  }

  /** Owner invites `email`; returns the token from the invite email. */
  async function invite(by: SignedInUser, email: string, role = 'recruiter'): Promise<string> {
    await t.http.post(`${ME}/members/invite`).set('Authorization', by.auth).send({ email, role }).expect(201);
    const mail = t.mailer.lastTo(email)!;
    expect(mail.text).toContain('/join-school?token=');
    return linkToken(mail.text);
  }

  /** A brand-new user signs up through the invite link and accepts it. */
  async function joinAsNewUser(token: string, email: string): Promise<SignedInUser> {
    const res = await t.http.post('/api/v1/auth/register').send({ email, password: 'teach2026', role: 'school', consent: true }).expect(201);
    const auth = `Bearer ${res.body.accessToken}`;
    await t.http.post(`${API}/invites/${token}/accept`).set('Authorization', auth).expect(200);
    return { email, userId: res.body.user.id, auth };
  }

  describe('onboarding', () => {
    it('creates the school with a unique slug; the owner is the contact by default', async () => {
      const a = await verifiedUser(t, 'school');
      const res = await t.http.post(API).set('Authorization', a.auth).send({ ...details, website: 'greenfield.edu.ng' }).expect(201);
      expect(res.body).toMatchObject({
        name: 'Greenfield Academy',
        slug: expect.stringMatching(/^greenfield-academy(-\d+)?$/),
        curriculum: ['nigerian', 'british'],
        website: 'https://greenfield.edu.ng',
        contact: { email: a.email, name: null },
        verificationStatus: 'unverified',
        myRole: 'owner',
      });
      const b = await verifiedUser(t, 'school');
      const second = await t.http.post(API).set('Authorization', b.auth).send(details).expect(201);
      expect(second.body.slug).not.toBe(res.body.slug);
      // One school per person.
      await t.http.post(API).set('Authorization', a.auth).send(details).expect(409);
    });

    it('validates details, contact person and the full address', async () => {
      const a = await owner();
      const fresh = await verifiedUser(t, 'school');
      const bad = await t.http.post(API).set('Authorization', fresh.auth).send({ name: 'X', curriculum: [] }).expect(400);
      expect(bad.body.error.details.issues.map((i: { path: string }) => i.path)).toEqual(
        expect.arrayContaining(['name', 'type', 'ownership', 'curriculum']),
      );
      await t.http.patch(ME).set('Authorization', a.auth).send({ contactPhone: '12345' }).expect(400);
      await t.http.put(`${ME}/location`).set('Authorization', a.auth).send({ stateId: lagos.id, lgaId: ikeja.id }).expect(400);
      const wrongLga = await t.http
        .put(`${ME}/location`)
        .set('Authorization', a.auth)
        .send({ stateId: lagos.id, lgaId: oyoLga.id, addressLine: '5 Allen Avenue, Ikeja' })
        .expect(400);
      expect(wrongLga.body.error.details.issues[0].path).toBe('lgaId');
    });

    it('resumes onboarding: details → location → contact', async () => {
      const a = await owner();
      let steps = await t.http.get('/api/v1/me/onboarding').set('Authorization', a.auth).expect(200);
      expect(steps.body.nextStep).toBe('location');

      const loc = await t.http
        .put(`${ME}/location`)
        .set('Authorization', a.auth)
        .send({ stateId: lagos.id, lgaId: ikeja.id, area: 'Allen', addressLine: '5 Allen Avenue, Ikeja', lat: 6.6, lng: 3.35 })
        .expect(200);
      expect(loc.body.location).toMatchObject({ state: { slug: 'lagos' }, lga: { slug: 'ikeja' }, addressLine: '5 Allen Avenue, Ikeja' });
      steps = await t.http.get('/api/v1/me/onboarding').set('Authorization', a.auth);
      expect(steps.body.nextStep).toBe('contact');

      const contact = await t.http
        .patch(ME)
        .set('Authorization', a.auth)
        .send({ contactName: 'Mrs Bisi Adeyemi', contactTitle: 'principal', contactPhone: '08031234567', contactEmail: 'Principal@Greenfield.edu.ng' })
        .expect(200);
      expect(contact.body.contact).toEqual({ name: 'Mrs Bisi Adeyemi', title: 'principal', phone: '+2348031234567', email: 'principal@greenfield.edu.ng' });
      steps = await t.http.get('/api/v1/me/onboarding').set('Authorization', a.auth);
      expect(steps.body).toMatchObject({ nextStep: null, complete: true });

      const [row] = await t.prisma.$queryRaw<{ y: number }[]>`SELECT ST_Y(geog::geometry) AS y FROM schools WHERE id = ${a.schoolId}::uuid`;
      expect(row.y).toBe(6.6);
    });

    it('uploads a logo through the scanned upload pipeline', async () => {
      const a = await owner();
      const uploadId = await uploadFile(t, a.auth, 'school_logo', 'logo.png', 'image/png', PNG);
      const res = await t.http.post(`${ME}/logo`).set('Authorization', a.auth).send({ uploadId }).expect(201);
      expect(res.body).toMatchObject({ scanStatus: 'clean', logoUrl: expect.stringContaining('school_logo/') });
    });

    it('guards: teachers, school users without a school, and unverified users are refused', async () => {
      const teacher = await verifiedUser(t, 'teacher');
      await t.http.post(API).set('Authorization', teacher.auth).send(details).expect(403);
      await t.http.get(ME).set('Authorization', teacher.auth).expect(403);
      const noSchool = await verifiedUser(t, 'school');
      const res = await t.http.get(ME).set('Authorization', noSchool.auth).expect(404);
      expect(res.body.error.message).toBe('You have not set up a school yet');
      const reg = await t.http.post('/api/v1/auth/register').send({ email: uniqueEmail('unverified'), password: 'teach2026', role: 'school', consent: true });
      await t.http.post(API).set('Authorization', `Bearer ${reg.body.accessToken}`).send(details).expect(403);
    });
  });

  describe('team', () => {
    it('invite → new user signs up from the link and joins as a recruiter (email verified by the link)', async () => {
      const a = await owner();
      const email = uniqueEmail('recruiter');
      const token = await invite(a, email);

      const preview = await t.http.get(`${API}/invites/${token}`).expect(200);
      expect(preview.body).toMatchObject({ schoolName: 'Greenfield Academy', email, role: 'recruiter', hasAccount: false });

      const r = await joinAsNewUser(token, email);
      const me = await t.http.get('/api/v1/me').set('Authorization', r.auth).expect(200);
      expect(me.body).toMatchObject({ role: 'recruiter', emailVerified: true, verified: true });
      const school = await t.http.get(ME).set('Authorization', r.auth).expect(200);
      expect(school.body).toMatchObject({ id: a.schoolId, myRole: 'recruiter' });

      const members = await t.http.get(`${ME}/members`).set('Authorization', a.auth).expect(200);
      expect(members.body.data.map((m: { role: string }) => m.role)).toEqual(['owner', 'recruiter']);
      expect(members.body.invites).toEqual([]);
      // The link works once.
      await t.http.get(`${API}/invites/${token}`).expect(404);
    });

    it('recruiters can read but not change the school or the team', async () => {
      const a = await owner();
      const email = uniqueEmail('recruiter');
      const r = await joinAsNewUser(await invite(a, email), email);
      await t.http.get(`${ME}/members`).set('Authorization', r.auth).expect(200);
      await t.http.patch(ME).set('Authorization', r.auth).send({ name: 'Hijacked' }).expect(403);
      await t.http.put(`${ME}/location`).set('Authorization', r.auth).send({ stateId: lagos.id, lgaId: ikeja.id, addressLine: '1 Road' }).expect(403);
      await t.http.post(`${ME}/members/invite`).set('Authorization', r.auth).send({ email: uniqueEmail('x') }).expect(403);
      await t.http.delete(`${ME}/members/${a.userId}`).set('Authorization', r.auth).expect(403);
    });

    it('the invite must be accepted by its own email, and never by a teacher account', async () => {
      const a = await owner();
      const email = uniqueEmail('target');
      const token = await invite(a, email);
      const stranger = await verifiedUser(t, 'school');
      const wrong = await t.http.post(`${API}/invites/${token}/accept`).set('Authorization', stranger.auth).expect(403);
      expect(wrong.body.error.message).toContain(email);

      const teacher = await verifiedUser(t, 'teacher');
      const tToken = await invite(a, teacher.email);
      const res = await t.http.post(`${API}/invites/${tToken}/accept`).set('Authorization', teacher.auth).expect(422);
      expect(res.body.error.message).toMatch(/teacher account/);
    });

    it('someone who already belongs to a school cannot join another', async () => {
      const a = await owner();
      const b = await owner();
      const token = await invite(a, b.email);
      const res = await t.http.post(`${API}/invites/${token}/accept`).set('Authorization', b.auth).expect(422);
      expect(res.body.error.message).toBe('You already belong to another school');
    });

    it('re-inviting refreshes the link; cancelled and expired links stop working', async () => {
      const a = await owner();
      const email = uniqueEmail('again');
      const first = await invite(a, email);
      const second = await invite(a, email);
      await t.http.get(`${API}/invites/${first}`).expect(404);
      await t.http.get(`${API}/invites/${second}`).expect(200);

      const members = await t.http.get(`${ME}/members`).set('Authorization', a.auth);
      expect(members.body.invites).toHaveLength(1);
      await t.http.delete(`${ME}/invites/${members.body.invites[0].id}`).set('Authorization', a.auth).expect(204);
      await t.http.get(`${API}/invites/${second}`).expect(404);

      const third = await invite(a, uniqueEmail('late'));
      await t.prisma.schoolInvite.updateMany({ where: { schoolId: a.schoolId, acceptedAt: null, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await t.http.get(`${API}/invites/${third}`).expect(404);
    });

    it('several owners allowed, never zero; removed members lose access immediately', async () => {
      const a = await owner();
      const email = uniqueEmail('co-owner');
      const b = await joinAsNewUser(await invite(a, email, 'owner'), email);
      expect((await t.http.get(ME).set('Authorization', b.auth)).body.myRole).toBe('owner');

      // Demote b, then the only owner (a) cannot demote or remove themselves.
      await t.http.patch(`${ME}/members/${b.userId}`).set('Authorization', a.auth).send({ role: 'recruiter' }).expect(204);
      const last = await t.http.patch(`${ME}/members/${a.userId}`).set('Authorization', a.auth).send({ role: 'recruiter' }).expect(422);
      expect(last.body.error.message).toMatch(/at least one owner/);
      await t.http.delete(`${ME}/members/${a.userId}`).set('Authorization', a.auth).expect(422);

      await t.http.delete(`${ME}/members/${b.userId}`).set('Authorization', a.auth).expect(204);
      await t.http.get(ME).set('Authorization', b.auth).expect(404);
      const me = await t.http.get('/api/v1/me').set('Authorization', b.auth);
      expect(me.body.role).toBe('school_owner');
    });

    it('a school cannot manage another school\'s members or invites', async () => {
      const a = await owner();
      const b = await owner();
      await t.http.delete(`${ME}/members/${b.userId}`).set('Authorization', a.auth).expect(404);
      await t.http.patch(`${ME}/members/${b.userId}`).set('Authorization', a.auth).send({ role: 'recruiter' }).expect(404);
      await invite(b, uniqueEmail('b-invite'));
      const bInvites = (await t.http.get(`${ME}/members`).set('Authorization', b.auth)).body.invites;
      await t.http.delete(`${ME}/invites/${bInvites[0].id}`).set('Authorization', a.auth).expect(404);
      const aMembers = await t.http.get(`${ME}/members`).set('Authorization', a.auth);
      expect(aMembers.body.data.map((m: { userId: string }) => m.userId)).toEqual([a.userId]);
    });

    it('inviting an existing team member is refused', async () => {
      const a = await owner();
      await t.http.post(`${ME}/members/invite`).set('Authorization', a.auth).send({ email: a.email }).expect(409);
    });
  });
});
