import { INTERVIEW_REMINDERS_JOB, InterviewsService } from '../src/modules/interviews/interviews.service';
import { liveVacancy, publishedTeacher, yes } from './fixtures';
import { createTestApp, deleteTestUsers, verifiedUser, type SignedInUser, type TestApp } from './utils';

const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

describe('Interviews (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    const snaps = await t.prisma.cvSnapshot.findMany({ where: { objectKey: { startsWith: 'cv-snapshots/' } }, select: { id: true } });
    await deleteTestUsers(t.prisma);
    await t.prisma.cvSnapshot.deleteMany({ where: { id: { in: snaps.map((s) => s.id) }, applications: { none: {} } } });
    await t.close();
  });

  /** A poster, a teacher who applied to their anonymous vacancy, and the application id. */
  async function applicant(): Promise<{ poster: SignedInUser; teacher: SignedInUser; applicationId: string }> {
    const poster = await verifiedUser(t, 'director');
    const v = await liveVacancy(t, poster, { locationVisibility: 'anonymous', schoolType: 'secondary' });
    const teacher = await publishedTeacher(t, 'Chika Obi');
    const app = await t.http.post(`/api/v1/vacancies/${v.id}/applications`).set('Authorization', teacher.auth).send({ screeningAnswers: yes(v) }).expect(201);
    return { poster, teacher, applicationId: app.body.id };
  }

  const schedule = (auth: string, applicationId: string, over: Record<string, unknown> = {}) =>
    t.http
      .post(`/api/v1/applications/${applicationId}/interviews`)
      .set('Authorization', auth)
      .send({ scheduledAt: inHours(72), durationMinutes: 30, mode: 'in_person', locationOrLink: '14 School Road, Ikeja', notes: 'Bring your certificates.', ...over });

  it('schedule → teacher confirms; the applicant moves to "interview" and sees the school', async () => {
    const { poster, teacher, applicationId } = await applicant();
    const res = await schedule(poster.auth, applicationId).expect(201);
    expect(res.body).toMatchObject({ status: 'proposed', mode: 'in_person', locationOrLink: '14 School Road, Ikeja', vacancy: { schoolLabel: 'Greenfield Academy' } });
    expect(t.mailer.lastTo(teacher.email)?.subject).toBe('Interview invitation: SS2 Physics Teacher');

    const mine = await t.http.get(`/api/v1/applications/me`).set('Authorization', teacher.auth).expect(200);
    expect(mine.body.data[0]).toMatchObject({ status: 'interview', vacancy: { schoolLabel: 'Greenfield Academy' } });
    // One status-change notice is not sent on top of the interview notice.
    const inbox = await t.http.get('/api/v1/notifications').set('Authorization', teacher.auth).expect(200);
    expect(inbox.body.data.map((n: { type: string }) => n.type)).toEqual(['interview']);

    await schedule(poster.auth, applicationId).expect(422); // one active interview at a time
    const upcoming = await t.http.get('/api/v1/interviews/me').set('Authorization', teacher.auth).expect(200);
    expect(upcoming.body.data).toHaveLength(1);
    expect((await t.http.get('/api/v1/interviews/me').set('Authorization', poster.auth).expect(200)).body.data[0].teacher.fullName).toBe('Chika Obi');

    const confirmed = await t.http.post(`/api/v1/interviews/${res.body.id}/confirm`).set('Authorization', teacher.auth).expect(200);
    expect(confirmed.body.status).toBe('confirmed');
    expect(t.mailer.lastTo(poster.email)?.subject).toBe('Interview confirmed: SS2 Physics Teacher');
    await t.http.post(`/api/v1/interviews/${res.body.id}/confirm`).set('Authorization', teacher.auth).expect(422);
  });

  it('teacher proposes another time; poster reschedules; the new time needs confirming', async () => {
    const { poster, teacher, applicationId } = await applicant();
    const iv = (await schedule(poster.auth, applicationId).expect(201)).body;
    const proposedAt = inHours(96);
    const proposed = await t.http.post(`/api/v1/interviews/${iv.id}/propose`).set('Authorization', teacher.auth).send({ proposedAt, note: 'I teach on Thursday mornings.' }).expect(200);
    expect(proposed.body).toMatchObject({ proposedAt: new Date(proposedAt).toISOString(), proposalNote: 'I teach on Thursday mornings.' });
    expect(t.mailer.lastTo(poster.email)?.subject).toBe('New interview time suggested: SS2 Physics Teacher');

    const moved = await t.http.patch(`/api/v1/interviews/${iv.id}`).set('Authorization', poster.auth).send({ scheduledAt: proposedAt }).expect(200);
    expect(moved.body).toMatchObject({ status: 'rescheduled', proposedAt: null, scheduledAt: new Date(proposedAt).toISOString() });
    expect(t.mailer.lastTo(teacher.email)?.subject).toBe('Interview moved: SS2 Physics Teacher');

    const video = await t.http.patch(`/api/v1/interviews/${iv.id}`).set('Authorization', poster.auth).send({ mode: 'video' }).expect(400);
    expect(video.body.error.details.issues[0].path).toBe('locationOrLink');
    await t.http.patch(`/api/v1/interviews/${iv.id}`).set('Authorization', poster.auth).send({ mode: 'video', locationOrLink: 'https://meet.google.com/abc-defg-hij' }).expect(200);
    await t.http.post(`/api/v1/interviews/${iv.id}/propose`).set('Authorization', teacher.auth).send({ proposedAt: new Date(Date.now() - HOUR).toISOString() }).expect(400);
  });

  it('either side cancels with a reason; cancelled interviews cannot change; done only after the time', async () => {
    const { poster, teacher, applicationId } = await applicant();
    const iv = (await schedule(poster.auth, applicationId).expect(201)).body;
    const cancelled = await t.http.post(`/api/v1/interviews/${iv.id}/cancel`).set('Authorization', teacher.auth).send({ reason: 'I took another job.' }).expect(200);
    expect(cancelled.body).toMatchObject({ status: 'cancelled', cancelReason: 'I took another job.' });
    expect(t.mailer.lastTo(poster.email)?.text).toContain('I took another job.');
    await t.http.post(`/api/v1/interviews/${iv.id}/confirm`).set('Authorization', teacher.auth).expect(422);
    expect((await t.http.get('/api/v1/interviews/me?past=true').set('Authorization', teacher.auth).expect(200)).body.data[0].id).toBe(iv.id);

    // A new one can be booked after a cancel.
    const next = (await schedule(poster.auth, applicationId).expect(201)).body;
    await t.http.post(`/api/v1/interviews/${next.id}/complete`).set('Authorization', poster.auth).expect(422);
    await t.prisma.interview.update({ where: { id: next.id }, data: { scheduledAt: new Date(Date.now() - HOUR) } });
    expect((await t.http.post(`/api/v1/interviews/${next.id}/complete`).set('Authorization', poster.auth).expect(200)).body.status).toBe('done');
    const listed = await t.http.get(`/api/v1/applications/${applicationId}/interviews`).set('Authorization', poster.auth).expect(200);
    expect(listed.body.map((i: { status: string }) => i.status).sort()).toEqual(['cancelled', 'done']);
  });

  it('guards: only the poster schedules, only the teacher confirms, nobody else sees them', async () => {
    const { poster, teacher, applicationId } = await applicant();
    const other = await verifiedUser(t, 'principal');
    const stranger = await publishedTeacher(t);
    await schedule(other.auth, applicationId).expect(404);
    await schedule(teacher.auth, applicationId).expect(403);
    await schedule(poster.auth, applicationId, { scheduledAt: inHours(-1) }).expect(400);
    await schedule(poster.auth, applicationId, { mode: 'video', locationOrLink: 'meet' }).expect(400);

    const iv = (await schedule(poster.auth, applicationId).expect(201)).body;
    await t.http.post(`/api/v1/interviews/${iv.id}/confirm`).set('Authorization', poster.auth).expect(403);
    await t.http.post(`/api/v1/interviews/${iv.id}/confirm`).set('Authorization', stranger.auth).expect(404);
    await t.http.patch(`/api/v1/interviews/${iv.id}`).set('Authorization', other.auth).send({ notes: 'x' }).expect(404);
    await t.http.post(`/api/v1/interviews/${iv.id}/cancel`).set('Authorization', other.auth).send({}).expect(404);
    await t.http.get(`/api/v1/applications/${applicationId}/interviews`).set('Authorization', stranger.auth).expect(200).expect([]);
    expect((await t.http.get('/api/v1/interviews/me').set('Authorization', other.auth).expect(200)).body.data).toEqual([]);
  });

  it('reminds both sides once, within 24 hours of the interview', async () => {
    const { poster, teacher, applicationId } = await applicant();
    const soon = (await schedule(poster.auth, applicationId, { scheduledAt: inHours(20) }).expect(201)).body;
    const later = await applicant();
    await schedule(later.poster.auth, later.applicationId, { scheduledAt: inHours(30) }).expect(201);

    expect(t.queue.scheduled).toContain(INTERVIEW_REMINDERS_JOB);
    await t.queue.run(INTERVIEW_REMINDERS_JOB);
    expect(t.mailer.lastTo(teacher.email)?.subject).toBe('Interview reminder: SS2 Physics Teacher');
    expect(t.mailer.lastTo(poster.email)?.subject).toBe('Interview reminder: SS2 Physics Teacher');
    expect(t.mailer.lastTo(later.teacher.email)?.subject).not.toBe('Interview reminder: SS2 Physics Teacher');
    expect((await t.prisma.interview.findUniqueOrThrow({ where: { id: soon.id } })).reminderSentAt).not.toBeNull();

    // Not twice.
    const sent = await t.app.get(InterviewsService).sendReminders();
    expect(sent).toBe(0);
  });
});
