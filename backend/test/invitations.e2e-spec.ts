import { MAX_INVITATIONS_PER_DAY } from '@edu-forum/shared';
import { liveVacancy, publishedTeacher, yes } from './fixtures';
import { createTestApp, deleteTestUsers, verifiedUser, type TestApp } from './utils';

describe('Invitations (e2e)', () => {
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

  const invite = (auth: string, vacancyId: string, teacherId: string, message?: string) =>
    t.http.post('/api/v1/invitations').set('Authorization', auth).send({ vacancyId, teacherId, message });

  it('invite → teacher sees the school (even anonymous) → accepts with screening answers → application', async () => {
    const poster = await verifiedUser(t, 'director');
    const v = await liveVacancy(t, poster, { locationVisibility: 'anonymous', schoolType: 'secondary' });
    const teacher = await publishedTeacher(t, 'Ngozi Eze');

    const sent = await invite(poster.auth, v.id, teacher.profileId, 'We liked your profile.').expect(201);
    expect(sent.body).toMatchObject({ status: 'pending', message: 'We liked your profile.', teacher: { id: teacher.profileId, fullName: 'Ngozi Eze' } });
    expect(t.mailer.lastTo(teacher.email)?.subject).toBe('You are invited to apply: SS2 Physics Teacher');
    expect(t.mailer.lastTo(teacher.email)?.text).toContain('Greenfield Academy');

    // The invited teacher now sees the anonymous school, on the invitation and the vacancy.
    const mine = await t.http.get('/api/v1/invitations/me').set('Authorization', teacher.auth).expect(200);
    expect(mine.body.data[0]).toMatchObject({ status: 'pending', vacancy: { id: v.id, schoolLabel: 'Greenfield Academy' } });
    expect(mine.body.data[0].vacancy.screeningQuestions).toHaveLength(1);
    expect((await t.http.get(`/api/v1/vacancies/${v.id}`).set('Authorization', teacher.auth).expect(200)).body.schoolLabel).toBe('Greenfield Academy');
    // …but nobody else does.
    const stranger = await publishedTeacher(t);
    expect((await t.http.get(`/api/v1/vacancies/${v.id}`).set('Authorization', stranger.auth).expect(200)).body.schoolLabel).toBe('Confidential school');

    // Screening questions must be answered when accepting.
    await t.http.post(`/api/v1/invitations/${sent.body.id}/accept`).set('Authorization', teacher.auth).send({ screeningAnswers: [] }).expect(400);
    const accepted = await t.http
      .post(`/api/v1/invitations/${sent.body.id}/accept`)
      .set('Authorization', teacher.auth)
      .send({ screeningAnswers: yes(v), coverNote: 'Thank you!' })
      .expect(201);
    expect(accepted.body).toMatchObject({ status: 'applied', coverNote: 'Thank you!' });
    const app = await t.prisma.application.findUniqueOrThrow({ where: { id: accepted.body.id } });
    expect(app.source).toBe('invited');
    expect(t.mailer.lastTo(poster.email)?.subject).toBe('Invitation accepted: SS2 Physics Teacher');

    const after = await t.http.get('/api/v1/invitations/sent').set('Authorization', poster.auth).expect(200);
    expect(after.body.data[0]).toMatchObject({ status: 'accepted', applicationId: accepted.body.id });
    await t.http.post(`/api/v1/invitations/${sent.body.id}/accept`).set('Authorization', teacher.auth).send({ screeningAnswers: yes(v) }).expect(422);
  });

  it('decline notifies the poster; cancel only while pending; one invitation per teacher per vacancy', async () => {
    const poster = await verifiedUser(t, 'principal');
    const v = await liveVacancy(t, poster);
    const teacher = await publishedTeacher(t, 'Tunde Bello');

    const first = await invite(poster.auth, v.id, teacher.profileId).expect(201);
    await invite(poster.auth, v.id, teacher.profileId).expect(409);
    await t.http.delete(`/api/v1/invitations/${first.body.id}`).set('Authorization', poster.auth).expect(204);
    expect((await t.http.get('/api/v1/invitations/me').set('Authorization', teacher.auth).expect(200)).body.meta.total).toBe(0);
    await t.http.post(`/api/v1/invitations/${first.body.id}/decline`).set('Authorization', teacher.auth).expect(404);

    // After a cancel the poster may invite again.
    const second = await invite(poster.auth, v.id, teacher.profileId).expect(201);
    await t.http.post(`/api/v1/invitations/${second.body.id}/decline`).set('Authorization', teacher.auth).expect(200);
    expect(t.mailer.lastTo(poster.email)?.subject).toBe('Invitation declined: SS2 Physics Teacher');
    const inbox = await t.http.get('/api/v1/notifications').set('Authorization', poster.auth).expect(200);
    expect(inbox.body.data[0]).toMatchObject({ type: 'invitation_reply', title: 'Invitation declined: SS2 Physics Teacher' });
    await t.http.delete(`/api/v1/invitations/${second.body.id}`).set('Authorization', poster.auth).expect(422);
    await invite(poster.auth, v.id, teacher.profileId).expect(409);
  });

  it('applying directly answers an open invitation; already-applied teachers cannot be invited', async () => {
    const poster = await verifiedUser(t, 'director');
    const v = await liveVacancy(t, poster);
    const teacher = await publishedTeacher(t);
    const inv = await invite(poster.auth, v.id, teacher.profileId).expect(201);
    const app = await t.http.post(`/api/v1/vacancies/${v.id}/applications`).set('Authorization', teacher.auth).send({ screeningAnswers: yes(v) }).expect(201);
    expect(await t.prisma.invitation.findUniqueOrThrow({ where: { id: inv.body.id } })).toMatchObject({ status: 'accepted', applicationId: app.body.id });

    const other = await verifiedUser(t, 'director');
    const v2 = await liveVacancy(t, other);
    await t.http.post(`/api/v1/vacancies/${v2.id}/applications`).set('Authorization', teacher.auth).send({ screeningAnswers: yes(v2) }).expect(201);
    await invite(other.auth, v2.id, teacher.profileId).expect(409);
  });

  it('guards: own live vacancy only, published teachers only, roles, ownership, daily cap', async () => {
    const poster = await verifiedUser(t, 'director');
    const other = await verifiedUser(t, 'director');
    const v = await liveVacancy(t, poster);
    const draft = await liveVacancy(t, poster, { publish: false });
    const teacher = await publishedTeacher(t);

    await invite(other.auth, v.id, teacher.profileId).expect(404);
    await invite(poster.auth, draft.id, teacher.profileId).expect(422);
    await t.prisma.teacherProfile.update({ where: { id: teacher.profileId }, data: { isPublished: false } });
    await invite(poster.auth, v.id, teacher.profileId).expect(404);
    await t.prisma.teacherProfile.update({ where: { id: teacher.profileId }, data: { isPublished: true } });
    await invite(teacher.auth, v.id, teacher.profileId).expect(403);

    const inv = await invite(poster.auth, v.id, teacher.profileId).expect(201);
    await t.http.delete(`/api/v1/invitations/${inv.body.id}`).set('Authorization', other.auth).expect(404);
    const intruder = await publishedTeacher(t);
    await t.http.post(`/api/v1/invitations/${inv.body.id}/decline`).set('Authorization', intruder.auth).expect(404);
    expect((await t.http.get('/api/v1/invitations/sent').set('Authorization', other.auth).expect(200)).body.meta.total).toBe(0);
    await t.http.get('/api/v1/invitations/sent').set('Authorization', teacher.auth).expect(403);

    // Daily cap: pretend the sender already sent the maximum today.
    const filler = Array.from({ length: MAX_INVITATIONS_PER_DAY - 1 }, () => ({ vacancyId: draft.id, teacherId: teacher.profileId, invitedById: poster.userId, status: 'cancelled' as const }));
    await t.prisma.invitation.createMany({ data: filler });
    const another = await publishedTeacher(t);
    const capped = await invite(poster.auth, v.id, another.profileId).expect(422);
    expect(capped.body.error.message).toContain(`${MAX_INVITATIONS_PER_DAY} invitations a day`);
  });

  it('pending invitations expire when the vacancy closes', async () => {
    const poster = await verifiedUser(t, 'director');
    const v = await liveVacancy(t, poster);
    const teacher = await publishedTeacher(t);
    const inv = await invite(poster.auth, v.id, teacher.profileId).expect(201);
    await t.http.post(`/api/v1/vacancies/${v.id}/close`).set('Authorization', poster.auth).send({ reason: 'filled' }).expect(200);
    const mine = await t.http.get('/api/v1/invitations/me').set('Authorization', teacher.auth).expect(200);
    expect(mine.body.data[0]).toMatchObject({ id: inv.body.id, status: 'expired' });
    const res = await t.http.post(`/api/v1/invitations/${inv.body.id}/accept`).set('Authorization', teacher.auth).send({ screeningAnswers: yes(v) }).expect(422);
    expect(res.body.error.message).toBe('This invitation has expired');
  });
});
