import { ACCOUNT_DELETION_GRACE_DAYS, PROFILE_REMINDER } from '@edu-forum/shared';
import { ACCOUNT_ERASURE_JOB } from '../src/modules/users/account-deletion.service';
import { REMINDER_JOBS, RemindersService } from '../src/modules/reminders/reminders.service';
import { liveVacancy, publishedTeacher, yes } from './fixtures';
import { createTestApp, deleteTestUsers, TEST_EMAIL_DOMAIN, verifiedUser, type TestApp } from './utils';

const DAY_MS = 86_400_000;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

describe('Dashboards, reminders, data export and account deletion (e2e)', () => {
  let t: TestApp;
  /** Erased users lose their email, so the cleanup cannot find them by domain. */
  const erased: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    for (const id of erased) await t.prisma.user.update({ where: { id }, data: { email: `erased-${id}@${TEST_EMAIL_DOMAIN}` } });
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  describe('dashboards', () => {
    it('teacher: applications by status, invites, views this week, saved jobs; profile views by role only', async () => {
      const director = await verifiedUser(t, 'director');
      const teacher = await publishedTeacher(t, 'Uche Eze');
      const applied = await liveVacancy(t, director, { title: 'SS1 Physics Teacher' });
      const invitedTo = await liveVacancy(t, director, { title: 'SS3 Physics Teacher' });
      await t.http.post(`/api/v1/vacancies/${applied.id}/applications`).set('Authorization', teacher.auth).send({ screeningAnswers: yes(applied) }).expect(201);
      await t.http.post('/api/v1/invitations').set('Authorization', director.auth).send({ vacancyId: invitedTo.id, teacherId: teacher.profileId }).expect(201);
      await t.http.post('/api/v1/saved').set('Authorization', teacher.auth).send({ itemType: 'vacancy', itemId: invitedTo.id }).expect(201);
      // The director opens the profile twice and the CV once: one viewer, one CV viewer.
      await t.http.get(`/api/v1/teachers/${teacher.profileId}`).set('Authorization', director.auth).expect(200);
      await t.http.get(`/api/v1/teachers/${teacher.profileId}`).set('Authorization', director.auth).expect(200);
      await t.http.get(`/api/v1/teachers/${teacher.profileId}/cv`).set('Authorization', director.auth).expect(200);

      const d = await t.http.get('/api/v1/teachers/me/dashboard').set('Authorization', teacher.auth).expect(200);
      expect(d.body).toMatchObject({
        isPublished: true,
        applications: { total: 1, byStatus: { applied: 1, hired: 0 } },
        invitations: { pending: 1 },
        interviews: { upcoming: 0 },
        views: { days: 7, viewers: 1, cvViewers: 1 },
        savedJobs: 1,
      });
      expect(d.body.recommended.length).toBeLessThanOrEqual(3);

      const views = await t.http.get('/api/v1/teachers/me/profile-views').set('Authorization', teacher.auth).expect(200);
      expect(views.body.meta.total).toBe(3);
      expect(views.body.data[0]).toMatchObject({ kind: 'cv_view', viewerRole: 'director' });
      expect(JSON.stringify(views.body)).not.toContain(director.email);
      expect(JSON.stringify(views.body)).not.toContain(director.userId);

      await t.http.get('/api/v1/teachers/me/dashboard').set('Authorization', director.auth).expect(403);
      await t.http.get('/api/v1/hiring/dashboard').set('Authorization', teacher.auth).expect(403);
    });

    it('principal/director: own open vacancies with applicant counts and pipeline only', async () => {
      const principal = await verifiedUser(t, 'principal');
      const v = await liveVacancy(t, principal);
      const a = await publishedTeacher(t);
      const b = await publishedTeacher(t);
      const appA = await t.http.post(`/api/v1/vacancies/${v.id}/applications`).set('Authorization', a.auth).send({ screeningAnswers: yes(v) }).expect(201);
      await t.http.post(`/api/v1/vacancies/${v.id}/applications`).set('Authorization', b.auth).send({ screeningAnswers: yes(v) }).expect(201);
      // Opening one marks it viewed.
      await t.http.get(`/api/v1/applications/${appA.body.id}`).set('Authorization', principal.auth).expect(200);

      const d = await t.http.get('/api/v1/hiring/dashboard').set('Authorization', principal.auth).expect(200);
      expect(d.body.vacancies).toMatchObject({ live: 1, paused: 0 });
      expect(d.body.open).toEqual([expect.objectContaining({ id: v.id, status: 'published', applicants: 2, unviewed: 1 })]);
      expect(d.body.pipeline).toMatchObject({ applied: 1, viewed: 1, hired: 0 });
      expect(d.body.recommended).toMatchObject({ vacancyId: v.id });
      expect(JSON.stringify(d.body)).not.toMatch(/Secret Close|"lat"|"lng"/);

      const other = await verifiedUser(t, 'director');
      const empty = await t.http.get('/api/v1/hiring/dashboard').set('Authorization', other.auth).expect(200);
      expect(empty.body).toMatchObject({ open: [], vacancies: { live: 0 }, pipeline: { applied: 0 }, recommended: null });
    });
  });

  describe('reminders', () => {
    it('vacancy closing within 3 days: one reminder per deadline', async () => {
      const director = await verifiedUser(t, 'director');
      const v = await liveVacancy(t, director, { deadline: isoDay(2) });
      const reminders = t.app.get(RemindersService);
      expect(t.queue.scheduled).toEqual(expect.arrayContaining(Object.values(REMINDER_JOBS).map((j) => j.name)));

      await t.queue.run(REMINDER_JOBS.vacancyExpiry.name);
      const mail = t.mailer.lastTo(director.email)!;
      expect(mail.subject).toBe('“SS2 Physics Teacher” closes in 2 days on EDU-FORUM');
      expect(mail.text).toContain(`/hiring/vacancies/${v.id}/edit`);
      const notices = await t.http.get('/api/v1/notifications').set('Authorization', director.auth).expect(200);
      expect(notices.body.data[0]).toMatchObject({ type: 'vacancy_expiring', title: '“SS2 Physics Teacher” closes in 2 days' });

      const mine = () => t.mailer.sent.filter((m) => m.to === director.email).length;
      const before = mine();
      await reminders.vacancyExpiry();
      expect(mine()).toBe(before);
      // A new deadline earns a new reminder when it comes near.
      await t.http.patch(`/api/v1/vacancies/${v.id}`).set('Authorization', director.auth).send({ deadline: isoDay(1) }).expect(200);
      await reminders.vacancyExpiry();
      expect(t.mailer.lastTo(director.email)!.subject).toBe('“SS2 Physics Teacher” closes tomorrow on EDU-FORUM');
    });

    it('unfinished profile: 3 days after sign-up, then weekly, at most 3 times', async () => {
      const teacher = await verifiedUser(t, 'teacher');
      await t.prisma.teacherProfile.create({ data: { userId: teacher.userId, fullName: 'Tola New' } });
      const reminders = t.app.get(RemindersService);
      const mine = () => t.mailer.sent.filter((m) => m.to === teacher.email && m.subject.includes('profile')).length;

      await reminders.profileIncomplete();
      expect(mine()).toBe(0); // signed up today
      await t.prisma.user.update({ where: { id: teacher.userId }, data: { createdAt: new Date(Date.now() - 4 * DAY_MS) } });
      await t.queue.run(REMINDER_JOBS.profileIncomplete.name);
      expect(mine()).toBe(1);
      const mail = t.mailer.lastTo(teacher.email)!;
      expect(mail.subject).toMatch(/^Your profile is \d+% complete on EDU-FORUM$/);
      expect(mail.text).toContain('active CV');
      expect(mail.text).toContain('/teacher/onboarding');

      await reminders.profileIncomplete();
      expect(mine()).toBe(1); // not again within a week
      for (let i = 0; i < 5; i++) {
        await t.prisma.teacherProfile.update({ where: { userId: teacher.userId }, data: { incompleteRemindedAt: new Date(Date.now() - 8 * DAY_MS) } });
        await reminders.profileIncomplete();
      }
      expect(mine()).toBe(PROFILE_REMINDER.max);
    });
  });

  describe('data export', () => {
    it('teacher: profile with private address, CVs with links, applications; anonymous school stays hidden', async () => {
      const director = await verifiedUser(t, 'director');
      const teacher = await publishedTeacher(t, 'Ngozi Obi');
      const anon = await liveVacancy(t, director, { locationVisibility: 'anonymous', schoolName: 'Hidden Heights College', title: 'Anonymous Physics Role' });
      await t.http.post(`/api/v1/vacancies/${anon.id}/applications`).set('Authorization', teacher.auth).send({ screeningAnswers: yes(anon), coverNote: 'I love physics' }).expect(201);

      const res = await t.http.get('/api/v1/me/export').set('Authorization', teacher.auth).expect(200);
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="edu-forum-my-data-\d{4}-\d{2}-\d{2}\.json"$/);
      expect(res.body.account).toMatchObject({ email: teacher.email, role: 'teacher' });
      expect(res.body.teacherProfile).toMatchObject({ fullName: 'Ngozi Obi', location: { addressLine: '12 Secret Close', state: 'Lagos' } });
      expect(res.body.cvs[0]).toMatchObject({ fileName: 'cv.pdf', active: true, downloadUrl: expect.stringMatching(/^memory:\/\/get\//) });
      expect(res.body.applications[0]).toMatchObject({ vacancy: { title: 'Anonymous Physics Role' }, coverNote: 'I love physics', status: 'applied' });
      expect(JSON.stringify(res.body)).not.toContain('Hidden Heights College');
      expect(res.body.notifications.length).toBeGreaterThanOrEqual(0);
    });

    it('principal/director: own vacancies and chats', async () => {
      const principal = await verifiedUser(t, 'principal');
      await liveVacancy(t, principal, { title: 'Chemistry Teacher' });
      const teacher = await publishedTeacher(t, 'Femi Ade');
      const chat = await t.http.post('/api/v1/conversations').set('Authorization', principal.auth).send({ teacherId: teacher.profileId }).expect(200);
      await t.http.post(`/api/v1/conversations/${chat.body.id}/messages`).set('Authorization', principal.auth).send({ body: 'Hello Femi' }).expect(201);

      const res = await t.http.get('/api/v1/me/export').set('Authorization', principal.auth).expect(200);
      expect(res.body.vacancies[0]).toMatchObject({ title: 'Chemistry Teacher', schoolName: 'Greenfield Academy' });
      expect(res.body.conversations[0]).toMatchObject({ with: 'Femi Ade', messages: [expect.objectContaining({ fromMe: true, body: 'Hello Femi' })] });
      expect(res.body.teacherProfile).toBeUndefined();
    });
  });

  describe('account deletion', () => {
    it('hidden at once; signing in within 30 days cancels', async () => {
      const director = await verifiedUser(t, 'director');
      const teacher = await publishedTeacher(t, 'Bola Hidden');
      const chat = await t.http.post('/api/v1/conversations').set('Authorization', director.auth).send({ teacherId: teacher.profileId }).expect(200);

      const del = await t.http.delete('/api/v1/me').set('Authorization', teacher.auth).expect(202);
      const days = (Date.parse(del.body.deletionScheduledFor) - Date.now()) / DAY_MS;
      expect(Math.round(days)).toBe(ACCOUNT_DELETION_GRACE_DAYS);
      expect(t.mailer.lastTo(teacher.email)!.subject).toBe('Your EDU-FORUM account will be deleted');
      // The old access token stops working, the profile disappears, and the chat says so.
      await t.http.get('/api/v1/teachers/me').set('Authorization', teacher.auth).expect(401);
      await t.http.get(`/api/v1/teachers/${teacher.profileId}`).set('Authorization', director.auth).expect(404);
      const search = await t.http.get('/api/v1/teachers?q=Bola').set('Authorization', director.auth).expect(200);
      expect(search.body.data.map((x: { id: string }) => x.id)).not.toContain(teacher.profileId);
      const convo = await t.http.get(`/api/v1/conversations/${chat.body.id}`).set('Authorization', director.auth).expect(200);
      expect(convo.body.other).toMatchObject({ name: 'Deleted teacher', deleted: true, teacherId: null });
      await t.http.post(`/api/v1/conversations/${chat.body.id}/messages`).set('Authorization', director.auth).send({ body: 'Hi' }).expect(422);

      const login = await t.http.post('/api/v1/auth/login').send({ identifier: teacher.email, password: 'teach2026' }).expect(200);
      expect(login.body).toMatchObject({ deletionCancelled: true, user: { deletionRequestedAt: null } });
      await t.http.get(`/api/v1/teachers/${teacher.profileId}`).set('Authorization', director.auth).expect(200);
      const again = await t.http.post('/api/v1/auth/login').send({ identifier: teacher.email, password: 'teach2026' }).expect(200);
      expect(again.body.deletionCancelled).toBeUndefined();
    });

    it('a deleting principal/director: their live job pages disappear', async () => {
      const director = await verifiedUser(t, 'director');
      const v = await liveVacancy(t, director);
      await t.http.get(`/api/v1/vacancies/${v.id}`).expect(200);
      await t.http.delete('/api/v1/me').set('Authorization', director.auth).expect(202);
      await t.http.get(`/api/v1/vacancies/${v.id}`).expect(404);
      const teacher = await publishedTeacher(t);
      await t.http.post(`/api/v1/vacancies/${v.id}/applications`).set('Authorization', teacher.auth).send({ screeningAnswers: yes(v) }).expect(404);
    });

    it('after 30 days: personal data and files erased; applications and chats remain as "Deleted teacher"', async () => {
      const director = await verifiedUser(t, 'director');
      const v = await liveVacancy(t, director);
      const teacher = await publishedTeacher(t, 'Kunle Gone');
      const app = await t.http.post(`/api/v1/vacancies/${v.id}/applications`).set('Authorization', teacher.auth).send({ screeningAnswers: yes(v), coverNote: 'Hire me' }).expect(201);
      const chat = await t.http.post('/api/v1/conversations').set('Authorization', director.auth).send({ teacherId: teacher.profileId }).expect(200);
      await t.http.post(`/api/v1/conversations/${chat.body.id}/messages`).set('Authorization', teacher.auth).send({ body: 'Thank you' }).expect(201);
      const keysBefore = (await t.prisma.cv.findMany({ where: { teacherId: teacher.profileId } })).map((c) => c.objectKey);
      expect(await t.storage.head(keysBefore[0])).not.toBeNull();

      await t.http.delete('/api/v1/me').set('Authorization', teacher.auth).expect(202);
      // Not yet due.
      await t.queue.run(ACCOUNT_ERASURE_JOB.name);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: teacher.userId } })).deletedAt).toBeNull();

      await t.prisma.user.update({ where: { id: teacher.userId }, data: { deletionRequestedAt: new Date(Date.now() - (ACCOUNT_DELETION_GRACE_DAYS + 1) * DAY_MS) } });
      await t.queue.run(ACCOUNT_ERASURE_JOB.name);
      erased.push(teacher.userId);

      const u = await t.prisma.user.findUniqueOrThrow({ where: { id: teacher.userId }, include: { teacherProfile: true } });
      expect(u).toMatchObject({ email: null, phone: null, passwordHash: null });
      expect(u.deletedAt).not.toBeNull();
      expect(u.teacherProfile).toMatchObject({ fullName: 'Deleted teacher', addressLine: null, lat: null, dob: null, isPublished: false });
      expect(await t.prisma.cv.count({ where: { teacherId: teacher.profileId } })).toBe(0);
      expect(await t.storage.head(keysBefore[0])).toBeNull();
      await t.http.post('/api/v1/auth/login').send({ identifier: teacher.email, password: 'teach2026' }).expect(401);

      const applicant = await t.http.get(`/api/v1/applications/${app.body.id}`).set('Authorization', director.auth).expect(200);
      expect(applicant.body).toMatchObject({ coverNote: null, teacher: { fullName: 'Deleted teacher', email: null, phone: null } });
      await t.http.get(`/api/v1/applications/${app.body.id}/cv`).set('Authorization', director.auth).expect(404);
      const messages = await t.http.get(`/api/v1/conversations/${chat.body.id}/messages`).set('Authorization', director.auth).expect(200);
      expect(messages.body.data[0]).toMatchObject({ body: 'Thank you', mine: false });
      expect(await t.prisma.auditLog.count({ where: { action: 'account.erased', targetId: teacher.userId } })).toBe(1);
    });

    it('admins cannot delete themselves here', async () => {
      const admin = await t.prisma.user.findFirstOrThrow({ where: { role: 'admin' } });
      // The seeded admin's password is not known here, so check the rule directly.
      const { AccountDeletionService } = await import('../src/modules/users/account-deletion.service');
      await expect(t.app.get(AccountDeletionService).request(admin.id)).rejects.toMatchObject({ status: 422 });
    });
  });
});
