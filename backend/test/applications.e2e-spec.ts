import { randomUUID } from 'node:crypto';
import { createTestApp, deleteTestUsers, DOCX, PDF, verifiedUser, type SignedInUser, type TestApp } from './utils';

const LONG = 'We are looking for a committed Physics teacher to plan lessons, mark scripts, prepare students for WAEC and NECO, and run the science laboratory.';

describe('Applications (e2e)', () => {
  let t: TestApp;
  let lagos: { id: string };
  let ikeja: { id: string };

  beforeAll(async () => {
    t = await createTestApp();
    lagos = await t.prisma.state.findUniqueOrThrow({ where: { slug: 'lagos' } });
    ikeja = await t.prisma.lga.findFirstOrThrow({ where: { stateId: lagos.id, slug: 'ikeja' } });
  });

  afterAll(async () => {
    const snaps = await t.prisma.cvSnapshot.findMany({ where: { objectKey: { startsWith: 'cv-snapshots/' } }, select: { id: true } });
    await deleteTestUsers(t.prisma);
    await t.prisma.cvSnapshot.deleteMany({ where: { id: { in: snaps.map((s) => s.id) }, applications: { none: {} } } });
    await t.close();
  });

  /** A signed-in teacher with a published profile and an active CV (in memory storage). */
  async function teacher(opts: { published?: boolean; docx?: boolean } = {}): Promise<SignedInUser & { profileId: string; cvKey: string }> {
    const user = await verifiedUser(t, 'teacher');
    const profile = await t.prisma.teacherProfile.create({
      data: {
        userId: user.userId,
        fullName: 'Ada Okafor',
        stateId: lagos.id,
        lgaId: ikeja.id,
        lat: 6.6,
        lng: 3.35,
        addressLine: '12 Secret Close',
        subjects: ['physics'],
        levels: ['sss'],
        jobTypes: ['full_time'],
        yearsExperience: 4,
        isPublished: opts.published ?? true,
      },
    });
    const ext = opts.docx ? 'docx' : 'pdf';
    const cvKey = `cv/${user.userId}/${randomUUID()}.${ext}`;
    const pdfKey = opts.docx ? cvKey.replace(/docx$/, 'pdf') : null;
    await t.storage.put(cvKey, opts.docx ? DOCX : PDF, 'application/pdf');
    if (pdfKey) await t.storage.put(pdfKey, PDF, 'application/pdf');
    await t.prisma.cv.create({
      data: { teacherId: profile.id, objectKey: cvKey, pdfKey, fileName: `cv.${ext}`, mimeType: ext, sizeBytes: 10, isActive: true, scanStatus: 'clean' },
    });
    return { ...user, profileId: profile.id, cvKey };
  }

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
        lat: 6.6,
        lng: 3.35,
        screeningQuestions: [
          { question: 'Are you TRCN registered?', type: 'yes_no' },
          { question: 'Why do you want this job?', type: 'text' },
        ],
        publish: true,
        ...over,
      })
      .expect(201);
    return res.body as { id: string; screeningQuestions: { id: string }[] };
  }

  const answers = (v: { screeningQuestions: { id: string }[] }) => [
    { questionId: v.screeningQuestions[0].id, answer: 'Yes' },
    { questionId: v.screeningQuestions[1].id, answer: 'I love teaching physics.' },
  ];

  async function apply(who: SignedInUser, v: { id: string; screeningQuestions: { id: string }[] }) {
    const res = await t.http
      .post(`/api/v1/vacancies/${v.id}/applications`)
      .set('Authorization', who.auth)
      .send({ coverNote: 'Please consider me.', screeningAnswers: answers(v) })
      .expect(201);
    return res.body as { id: string };
  }

  describe('applying', () => {
    it('stores a CV snapshot, the answers and the match score; emails the poster', async () => {
      const poster = await verifiedUser(t, 'director');
      const v = await vacancy(poster);
      const me = await teacher();
      const res = await t.http
        .post(`/api/v1/vacancies/${v.id}/applications`)
        .set('Authorization', me.auth)
        .send({ coverNote: 'Please consider me.', screeningAnswers: answers(v) })
        .expect(201);
      expect(res.body).toMatchObject({
        status: 'applied',
        coverNote: 'Please consider me.',
        cvFileName: 'cv.pdf',
        screeningAnswers: [
          { question: 'Are you TRCN registered?', answer: 'yes' },
          { question: 'Why do you want this job?', answer: 'I love teaching physics.' },
        ],
        vacancy: { title: 'SS2 Physics Teacher', schoolLabel: 'Greenfield Academy' },
        history: [{ toStatus: 'applied', by: 'Teacher' }],
      });
      const row = await t.prisma.application.findUniqueOrThrow({ where: { id: res.body.id }, include: { cvSnapshot: true } });
      expect(row.matchScore).toBe(100);
      expect(row.cvSnapshot.objectKey).toMatch(/^cv-snapshots\//);
      expect(t.storage.objects.has(row.cvSnapshot.objectKey)).toBe(true);
      expect(t.mailer.lastTo(poster.email)?.subject).toBe('New application: SS2 Physics Teacher');

      // Replacing the CV later does not change what was sent.
      await t.prisma.cv.updateMany({ where: { teacherId: me.profileId }, data: { isActive: false, replacedAt: new Date() } });
      await t.storage.delete(me.cvKey);
      expect(t.storage.objects.has(row.cvSnapshot.objectKey)).toBe(true);
    });

    it('one application per vacancy (409); profile must be published; vacancy must be live', async () => {
      const poster = await verifiedUser(t, 'director');
      const v = await vacancy(poster);
      const me = await teacher();
      await apply(me, v);
      const dup = await t.http.post(`/api/v1/vacancies/${v.id}/applications`).set('Authorization', me.auth).send({ screeningAnswers: answers(v) }).expect(409);
      expect(dup.body.error.code).toBe('CONFLICT');

      const draftProfile = await teacher({ published: false });
      const res = await t.http.post(`/api/v1/vacancies/${v.id}/applications`).set('Authorization', draftProfile.auth).send({ screeningAnswers: answers(v) }).expect(422);
      expect(res.body.error.message).toBe('Publish your profile before applying');

      const draft = await vacancy(poster, { publish: false });
      const another = await teacher();
      await t.http.post(`/api/v1/vacancies/${draft.id}/applications`).set('Authorization', another.auth).send({}).expect(404);
      await t.http.post(`/api/v1/vacancies/${v.id}/applications`).set('Authorization', poster.auth).send({}).expect(403);
    });

    it('every screening question needs an answer; yes/no must be yes or no', async () => {
      const poster = await verifiedUser(t, 'director');
      const v = await vacancy(poster);
      const me = await teacher();
      const missing = await t.http.post(`/api/v1/vacancies/${v.id}/applications`).set('Authorization', me.auth).send({ screeningAnswers: [answers(v)[0]] }).expect(400);
      expect(missing.body.error.details.issues[0]).toMatchObject({ path: 'screeningAnswers.1' });
      const bad = [{ ...answers(v)[0], answer: 'maybe' }, answers(v)[1]];
      await t.http.post(`/api/v1/vacancies/${v.id}/applications`).set('Authorization', me.auth).send({ screeningAnswers: bad }).expect(400);
    });
  });

  describe('pipeline', () => {
    it('poster opens (viewed), shortlists, interviews, offers, hires; teacher is emailed; history kept', async () => {
      const poster = await verifiedUser(t, 'principal');
      const v = await vacancy(poster, { openings: 1 });
      const me = await teacher();
      const a = await apply(me, v);

      const opened = await t.http.get(`/api/v1/applications/${a.id}`).set('Authorization', poster.auth).expect(200);
      expect(opened.body).toMatchObject({ status: 'viewed', teacher: { fullName: 'Ada Okafor', email: me.email }, cv: { fileName: 'cv.pdf' } });
      expect(JSON.stringify(opened.body)).not.toContain('Secret Close');

      const move = (status: string, extra: object = {}) =>
        t.http.patch(`/api/v1/applications/${a.id}/status`).set('Authorization', poster.auth).send({ status, ...extra });
      await move('shortlisted', { message: 'Great profile!' }).expect(200);
      const mail = t.mailer.lastTo(me.email)!;
      expect(mail.subject).toBe('Your application: Shortlisted (SS2 Physics Teacher)');
      expect(mail.text).toContain('Great profile!');

      await move('applied').expect(400); // not a poster status
      await move('viewed').expect(422); // backwards
      await move('offered').expect(200); // skipping forward is allowed
      const hired = await move('hired', { closeVacancy: true }).expect(200);
      expect(hired.body).toMatchObject({ openingsFilled: true, vacancyClosed: true, application: { status: 'hired' } });
      const closed = await t.prisma.vacancy.findUniqueOrThrow({ where: { id: v.id } });
      expect(closed).toMatchObject({ status: 'closed', closeReason: 'filled' });
      await move('rejected').expect(422); // final

      const history = await t.http.get(`/api/v1/applications/${a.id}/history`).set('Authorization', me.auth).expect(200);
      expect(history.body.data.map((h: { toStatus: string }) => h.toStatus)).toEqual(['applied', 'viewed', 'shortlisted', 'offered', 'hired']);
      expect(history.body.data[2]).toMatchObject({ by: 'Principal', message: 'Great profile!' });
    });

    it('teacher withdraws (poster emailed); cannot withdraw a final application', async () => {
      const poster = await verifiedUser(t, 'director');
      const v = await vacancy(poster);
      const me = await teacher();
      const a = await apply(me, v);
      const res = await t.http.post(`/api/v1/applications/${a.id}/withdraw`).set('Authorization', me.auth).expect(200);
      expect(res.body.status).toBe('withdrawn');
      expect(t.mailer.lastTo(poster.email)?.subject).toBe('Application withdrawn: SS2 Physics Teacher');
      await t.http.post(`/api/v1/applications/${a.id}/withdraw`).set('Authorization', me.auth).expect(422);
      await t.http.patch(`/api/v1/applications/${a.id}/status`).set('Authorization', poster.auth).send({ status: 'shortlisted' }).expect(422);
    });

    it('anonymous vacancy: the school is revealed to the teacher only once shortlisted', async () => {
      const poster = await verifiedUser(t, 'director');
      const v = await vacancy(poster, { locationVisibility: 'anonymous', schoolName: 'Secret Academy' });
      const me = await teacher();
      const a = await apply(me, v);
      const before = await t.http.get(`/api/v1/applications/${a.id}`).set('Authorization', me.auth).expect(200);
      expect(before.body.vacancy.schoolLabel).toBe('Confidential school');
      expect(JSON.stringify(before.body)).not.toContain('Secret Academy');
      await t.http.patch(`/api/v1/applications/${a.id}/status`).set('Authorization', poster.auth).send({ status: 'shortlisted' }).expect(200);
      expect(t.mailer.lastTo(me.email)?.text).toContain('Secret Academy');
      const after = await t.http.get(`/api/v1/applications/${a.id}`).set('Authorization', me.auth).expect(200);
      expect(after.body.vacancy.schoolLabel).toBe('Secret Academy');
    });

    it('bulk-status moves several and reports the ones that cannot move', async () => {
      const poster = await verifiedUser(t, 'director');
      const v = await vacancy(poster);
      const [a1, a2, a3] = [await apply(await teacher(), v), await apply(await teacher(), v), await apply(await teacher(), v)];
      await t.http.patch(`/api/v1/applications/${a3.id}/status`).set('Authorization', poster.auth).send({ status: 'rejected' }).expect(200);
      const res = await t.http
        .post(`/api/v1/vacancies/${v.id}/applications/bulk-status`)
        .set('Authorization', poster.auth)
        .send({ applicationIds: [a1.id, a2.id, a3.id, randomUUID()], status: 'shortlisted' })
        .expect(200);
      expect(res.body.updated.sort()).toEqual([a1.id, a2.id].sort());
      expect(res.body.skipped).toHaveLength(2);
      const list = await t.http.get(`/api/v1/vacancies/${v.id}/applications?status=shortlisted`).set('Authorization', poster.auth).expect(200);
      expect(list.body.meta.total).toBe(2);
    });
  });

  describe('poster tools', () => {
    it('rating, private notes (own only), filter by rating, CSV export with formula escaping', async () => {
      const poster = await verifiedUser(t, 'director');
      const v = await vacancy(poster);
      const me = await teacher();
      await t.prisma.teacherProfile.update({ where: { id: me.profileId }, data: { fullName: '=HYPERLINK("http://evil")' } });
      const a = await apply(me, v);

      await t.http.patch(`/api/v1/applications/${a.id}/rating`).set('Authorization', poster.auth).send({ rating: 6 }).expect(400);
      const rated = await t.http.patch(`/api/v1/applications/${a.id}/rating`).set('Authorization', poster.auth).send({ rating: 4 }).expect(200);
      expect(rated.body.rating).toBe(4);
      const byRating = await t.http.get(`/api/v1/vacancies/${v.id}/applications?rating=4`).set('Authorization', poster.auth).expect(200);
      expect(byRating.body.data.map((x: { id: string }) => x.id)).toEqual([a.id]);

      const note = await t.http.post(`/api/v1/applications/${a.id}/notes`).set('Authorization', poster.auth).send({ body: 'Strong lab skills' }).expect(201);
      const notes = await t.http.get(`/api/v1/applications/${a.id}/notes`).set('Authorization', poster.auth).expect(200);
      expect(notes.body.data).toEqual([expect.objectContaining({ body: 'Strong lab skills', mine: true })]);
      // Teachers never see notes.
      await t.http.get(`/api/v1/applications/${a.id}/notes`).set('Authorization', me.auth).expect(403);
      const mine = await t.http.get(`/api/v1/applications/${a.id}`).set('Authorization', me.auth).expect(200);
      expect(JSON.stringify(mine.body)).not.toContain('Strong lab skills');
      await t.http.delete(`/api/v1/applications/${a.id}/notes/${note.body.id}`).set('Authorization', poster.auth).expect(204);

      const csv = await t.http.get(`/api/v1/vacancies/${v.id}/applications/export`).set('Authorization', poster.auth).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toContain('applicants-ss2-physics-teacher.csv');
      const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
      expect(lines[0]).toContain('"Name","Phone","Email"');
      expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"")"`);
      expect(lines[1]).toContain(`"${me.email}"`);
    });

    it('CV link is the snapshot (view = PDF, download = original) and is logged', async () => {
      const poster = await verifiedUser(t, 'director');
      const v = await vacancy(poster);
      const me = await teacher({ docx: true });
      const a = await apply(me, v);
      const view = await t.http.get(`/api/v1/applications/${a.id}/cv`).set('Authorization', poster.auth).expect(200);
      expect(view.body.url).toMatch(/cv-snapshots\/.+\/view\.pdf$/);
      const dl = await t.http.get(`/api/v1/applications/${a.id}/cv?download=true`).set('Authorization', poster.auth).expect(200);
      expect(dl.body.url).toMatch(/cv-snapshots\/.+\/cv\.docx\?download=cv\.docx$/);
      const kinds = (await t.prisma.profileView.findMany({ where: { teacherId: me.profileId } })).map((x) => x.kind);
      expect(kinds).toEqual(expect.arrayContaining(['cv_view', 'cv_download']));
    });

    it('someone else\'s vacancy and applications are not found', async () => {
      const poster = await verifiedUser(t, 'director');
      const other = await verifiedUser(t, 'principal');
      const v = await vacancy(poster);
      const me = await teacher();
      const a = await apply(me, v);
      await t.http.get(`/api/v1/vacancies/${v.id}/applications`).set('Authorization', other.auth).expect(404);
      await t.http.get(`/api/v1/applications/${a.id}`).set('Authorization', other.auth).expect(404);
      await t.http.patch(`/api/v1/applications/${a.id}/status`).set('Authorization', other.auth).send({ status: 'shortlisted' }).expect(404);
      await t.http.get(`/api/v1/applications/${a.id}/cv`).set('Authorization', other.auth).expect(404);
      await t.http.get(`/api/v1/vacancies/${v.id}/applications/export`).set('Authorization', other.auth).expect(404);
      // Another teacher cannot read or withdraw it either.
      const stranger = await teacher();
      await t.http.get(`/api/v1/applications/${a.id}`).set('Authorization', stranger.auth).expect(404);
      await t.http.post(`/api/v1/applications/${a.id}/withdraw`).set('Authorization', stranger.auth).expect(404);
    });

    it('title or salary changes on a live vacancy email its applicants', async () => {
      const poster = await verifiedUser(t, 'director');
      const v = await vacancy(poster);
      const me = await teacher();
      await apply(me, v);
      await t.http.patch(`/api/v1/vacancies/${v.id}`).set('Authorization', poster.auth).send({ salaryMax: 300_000 }).expect(200);
      const mail = t.mailer.lastTo(me.email)!;
      expect(mail.subject).toBe('A job you applied for was updated: SS2 Physics Teacher');
      expect(mail.text).toContain('Salary:');
    });
  });

  it('GET /applications/me lists the teacher\'s applications', async () => {
    const poster = await verifiedUser(t, 'director');
    const me = await teacher();
    await apply(me, await vacancy(poster));
    await apply(me, await vacancy(poster, { title: 'JSS Physics Teacher' }));
    const res = await t.http.get('/api/v1/applications/me').set('Authorization', me.auth).expect(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.map((a: { vacancy: { title: string } }) => a.vacancy.title).sort()).toEqual(['JSS Physics Teacher', 'SS2 Physics Teacher']);
  });
});
