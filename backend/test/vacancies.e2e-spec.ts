import { VacanciesService } from '../src/modules/vacancies/vacancies.service';
import { createTestApp, deleteTestUsers, verifiedUser, type SignedInUser, type TestApp } from './utils';

const V = '/api/v1/vacancies';
const LONG = 'We are looking for an experienced Physics teacher for SS1 to SS3 classes. You will plan lessons, prepare students for WAEC and NECO, and run the science lab.';

describe('Vacancies (e2e)', () => {
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

  const vacancy = (over: Record<string, unknown> = {}) => ({
    title: 'SS2 Physics Teacher',
    subjects: ['physics'],
    levels: ['sss'],
    jobType: 'full_time',
    salaryMin: 150_000,
    salaryMax: 220_000,
    description: `<p>${LONG}</p>`,
    schoolName: 'Greenfield Academy',
    schoolType: 'secondary',
    stateId: lagos.id,
    lgaId: ikeja.id,
    area: 'Allen Avenue',
    addressLine: '5 Allen Avenue, Ikeja',
    lat: 6.6,
    lng: 3.35,
    benefits: ['transport'],
    screeningQuestions: [{ question: 'Do you have WAEC marking experience?', type: 'yes_no' }],
    ...over,
  });

  async function post(by: SignedInUser, over: Record<string, unknown> = {}) {
    const res = await t.http.post(V).set('Authorization', by.auth).send(vacancy(over)).expect(201);
    return res.body;
  }

  it('principals and directors post; teachers and signed-out visitors cannot', async () => {
    const principal = await verifiedUser(t, 'principal');
    const director = await verifiedUser(t, 'director');
    const teacher = await verifiedUser(t, 'teacher');
    expect(await post(principal)).toMatchObject({ status: 'draft', postedBy: 'Principal', salaryCurrency: 'NGN', salaryPeriod: 'monthly', openings: 1 });
    expect((await post(director)).postedBy).toBe('Director');
    await t.http.post(V).set('Authorization', teacher.auth).send(vacancy()).expect(403);
    await t.http.post(V).send(vacancy()).expect(401);
  });

  it('location, details and salary range are compulsory; salary min <= max; school name unless anonymous', async () => {
    const d = await verifiedUser(t, 'director');
    const empty = await t.http.post(V).set('Authorization', d.auth).send({}).expect(400);
    const paths = empty.body.error.details.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining(['title', 'subjects', 'levels', 'jobType', 'salaryMin', 'salaryMax', 'description', 'stateId', 'lgaId']),
    );

    const salary = await t.http.post(V).set('Authorization', d.auth).send(vacancy({ salaryMin: 300_000, salaryMax: 100_000 })).expect(400);
    expect(salary.body.error.details.issues[0]).toMatchObject({ path: 'salaryMax' });
    await t.http.post(V).set('Authorization', d.auth).send(vacancy({ salaryMin: 0 })).expect(400);

    const noName = await t.http.post(V).set('Authorization', d.auth).send(vacancy({ schoolName: '' })).expect(400);
    expect(noName.body.error.details.issues[0]).toMatchObject({ path: 'schoolName' });
    await t.http.post(V).set('Authorization', d.auth).send(vacancy({ schoolName: '', locationVisibility: 'anonymous' })).expect(201);

    // 100 visible characters: tags do not count.
    await t.http.post(V).set('Authorization', d.auth).send(vacancy({ description: `<p><strong>${'x'.repeat(40)}</strong></p>` })).expect(400);
    const wrongLga = await t.http.post(V).set('Authorization', d.auth).send(vacancy({ lgaId: oyoLga.id })).expect(400);
    expect(wrongLga.body.error.details.issues[0].path).toBe('lgaId');
    await t.http.post(V).set('Authorization', d.auth).send(vacancy({ subjects: ['alchemy'] })).expect(400);
    const tooMany = Array.from({ length: 6 }, (_, i) => ({ question: `Question number ${i}` }));
    await t.http.post(V).set('Authorization', d.auth).send(vacancy({ screeningQuestions: tooMany })).expect(400);
  });

  it('sanitises the description', async () => {
    const d = await verifiedUser(t, 'director');
    const v = await post(d, {
      description: `<p onclick="steal()">${LONG}</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><a href="https://example.com">site</a>`,
    });
    expect(v.description).not.toMatch(/script|onclick|onerror|<img|javascript:/);
    expect(v.description).toContain('<a href="https://example.com" rel="nofollow noopener noreferrer" target="_blank">site</a>');
  });

  it('lifecycle: draft → published → paused → published → closed; deadline defaults to 30 days', async () => {
    const d = await verifiedUser(t, 'director');
    const v = await post(d);
    const published = await t.http.post(`${V}/${v.id}/publish`).set('Authorization', d.auth).expect(200);
    const days = (new Date(published.body.deadline).getTime() - Date.now()) / 86_400_000;
    expect(published.body).toMatchObject({ status: 'published', publishedAt: expect.any(String) });
    expect(days).toBeGreaterThan(28.9);
    expect(days).toBeLessThanOrEqual(30);

    await t.http.post(`${V}/${v.id}/pause`).set('Authorization', d.auth).expect(200);
    await t.http.post(`${V}/${v.id}/pause`).set('Authorization', d.auth).expect(422);
    await t.http.post(`${V}/${v.id}/publish`).set('Authorization', d.auth).expect(200);
    const closed = await t.http.post(`${V}/${v.id}/close`).set('Authorization', d.auth).send({ reason: 'filled' }).expect(200);
    expect(closed.body).toMatchObject({ status: 'closed', closeReason: 'filled' });
    await t.http.post(`${V}/${v.id}/publish`).set('Authorization', d.auth).expect(422);
    await t.http.patch(`${V}/${v.id}`).set('Authorization', d.auth).send({ title: 'Changed' }).expect(422);
  });

  it('only drafts can be deleted; duplicate makes a new draft', async () => {
    const d = await verifiedUser(t, 'director');
    const draft = await post(d);
    await t.http.delete(`${V}/${draft.id}`).set('Authorization', d.auth).expect(204);
    await t.http.get(`${V}/mine/${draft.id}`).set('Authorization', d.auth).expect(404);

    const live = await post(d, { publish: true });
    expect(live.status).toBe('published');
    await t.http.delete(`${V}/${live.id}`).set('Authorization', d.auth).expect(422);

    const copy = await t.http.post(`${V}/${live.id}/duplicate`).set('Authorization', d.auth).expect(201);
    expect(copy.body).toMatchObject({ status: 'draft', title: live.title, deadline: null, publishedAt: null });
    expect(copy.body.id).not.toBe(live.id);
    expect(copy.body.shortId).not.toBe(live.shortId);
    expect(copy.body.screeningQuestions[0].id).not.toBe(live.screeningQuestions[0].id);
  });

  it('edits re-check the merged vacancy; the slug is frozen once published; question ids are kept', async () => {
    const d = await verifiedUser(t, 'director');
    const v = await post(d);
    const renamed = await t.http.patch(`${V}/${v.id}`).set('Authorization', d.auth).send({ title: 'JSS Maths Teacher' }).expect(200);
    expect(renamed.body.slug).toBe('jss-maths-teacher');

    await t.http.post(`${V}/${v.id}/publish`).set('Authorization', d.auth).expect(200);
    const edited = await t.http
      .patch(`${V}/${v.id}`)
      .set('Authorization', d.auth)
      .send({ title: 'Senior Maths Teacher', screeningQuestions: renamed.body.screeningQuestions })
      .expect(200);
    expect(edited.body).toMatchObject({ title: 'Senior Maths Teacher', slug: 'jss-maths-teacher' });
    expect(edited.body.screeningQuestions[0].id).toBe(v.screeningQuestions[0].id);

    // Only salaryMin changes, but the merged result breaks min <= max.
    await t.http.patch(`${V}/${v.id}`).set('Authorization', d.auth).send({ salaryMin: 999_999 }).expect(400);
    // Switching a listed vacancy to anonymous is allowed; clearing the name while listed is not.
    await t.http.patch(`${V}/${v.id}`).set('Authorization', d.auth).send({ schoolName: '' }).expect(400);
  });

  it('a poster cannot see or change someone else\'s vacancy', async () => {
    const a = await verifiedUser(t, 'principal');
    const b = await verifiedUser(t, 'director');
    const v = await post(a);
    await t.http.patch(`${V}/${v.id}`).set('Authorization', b.auth).send({ title: 'Hijack' }).expect(404);
    await t.http.post(`${V}/${v.id}/publish`).set('Authorization', b.auth).expect(404);
    await t.http.delete(`${V}/${v.id}`).set('Authorization', b.auth).expect(404);
    await t.http.get(`${V}/mine/${v.id}`).set('Authorization', b.auth).expect(404);
    // A draft is invisible to everyone but its poster.
    await t.http.get(`${V}/${v.id}`).set('Authorization', b.auth).expect(404);
    await t.http.get(`${V}/${v.id}`).expect(404);
    const mine = await t.http.get(`${V}/mine`).set('Authorization', b.auth).expect(200);
    expect(mine.body.data.map((x: { id: string }) => x.id)).not.toContain(v.id);
  });

  it('GET /vacancies/mine lists own vacancies with counts, filtered by status and paginated', async () => {
    const d = await verifiedUser(t, 'director');
    await post(d);
    await post(d, { publish: true });
    await post(d, { publish: true });
    const all = await t.http.get(`${V}/mine`).set('Authorization', d.auth).expect(200);
    expect(all.body.meta).toEqual({ page: 1, limit: 20, total: 3 });
    expect(all.body.data[0]).toMatchObject({ applicantsCount: 0, locationVisibility: 'listed' });
    const live = await t.http.get(`${V}/mine?status=published&limit=1`).set('Authorization', d.auth).expect(200);
    expect(live.body).toMatchObject({ meta: { total: 2, limit: 1 }, data: [expect.objectContaining({ status: 'published' })] });
  });

  describe('anonymous vacancies never leak the school', () => {
    let poster: SignedInUser;
    let anon: { id: string };

    beforeAll(async () => {
      poster = await verifiedUser(t, 'director');
      anon = await post(poster, { locationVisibility: 'anonymous', schoolName: 'Secret Academy', publish: true });
    });

    it('public, other posters and teachers see "Confidential school", state, LGA and school type only', async () => {
      const other = await verifiedUser(t, 'principal');
      const teacher = await verifiedUser(t, 'teacher');
      for (const auth of [undefined, other.auth, teacher.auth]) {
        const req = t.http.get(`${V}/${anon.id}`);
        const res = await (auth ? req.set('Authorization', auth) : req).expect(200);
        expect(res.body).toMatchObject({
          isAnonymous: true,
          schoolLabel: 'Confidential school',
          schoolName: null,
          schoolType: 'secondary',
          revealed: false,
          location: { state: { slug: 'lagos' }, lga: { slug: 'ikeja' }, area: null, addressLine: null, lat: null, lng: null },
        });
        const json = JSON.stringify(res.body);
        expect(json).not.toContain('Secret Academy');
        expect(json).not.toContain('Allen');
        expect(json).not.toContain('6.6');
      }
    });

    it('the poster always sees everything', async () => {
      const res = await t.http.get(`${V}/${anon.id}`).set('Authorization', poster.auth).expect(200);
      expect(res.body).toMatchObject({ schoolName: 'Secret Academy', schoolLabel: 'Secret Academy', revealed: true });
    });

    it('a shortlisted teacher sees the school; an applied one does not', async () => {
      const shortlisted = await verifiedUser(t, 'teacher');
      const applied = await verifiedUser(t, 'teacher');
      for (const [user, status] of [
        [shortlisted, 'shortlisted'],
        [applied, 'applied'],
      ] as const) {
        const profile = await t.prisma.teacherProfile.create({ data: { userId: user.userId } });
        const snapshot = await t.prisma.cvSnapshot.create({ data: { objectKey: 'x', fileName: 'cv.pdf', mimeType: 'pdf', sizeBytes: 1 } });
        await t.prisma.application.create({ data: { vacancyId: anon.id, teacherId: profile.id, cvSnapshotId: snapshot.id, status } });
      }
      const yes = await t.http.get(`${V}/${anon.id}`).set('Authorization', shortlisted.auth).expect(200);
      expect(yes.body).toMatchObject({ schoolName: 'Secret Academy', revealed: true, location: { addressLine: '5 Allen Avenue, Ikeja' } });
      const no = await t.http.get(`${V}/${anon.id}`).set('Authorization', applied.auth).expect(200);
      expect(no.body.schoolName).toBeNull();
    });

    it('a listed vacancy shows the school publicly', async () => {
      const listed = await post(poster, { publish: true });
      const res = await t.http.get(`${V}/${listed.id}`).expect(200);
      expect(res.body).toMatchObject({ isAnonymous: false, schoolName: 'Greenfield Academy', schoolLabel: 'Greenfield Academy', location: { addressLine: '5 Allen Avenue, Ikeja' } });
    });
  });

  it('nightly expiry closes live vacancies past their deadline', async () => {
    const d = await verifiedUser(t, 'director');
    const v = await post(d, { publish: true });
    await t.prisma.vacancy.update({ where: { id: v.id }, data: { deadline: new Date(Date.now() - 2 * 86_400_000) } });
    await t.app.get(VacanciesService).expire();
    const res = await t.http.get(`${V}/mine/${v.id}`).set('Authorization', d.auth).expect(200);
    expect(res.body).toMatchObject({ status: 'closed', closeReason: 'expired' });
  });
});
