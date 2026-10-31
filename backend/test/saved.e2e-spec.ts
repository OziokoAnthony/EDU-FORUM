import { MAX_SAVED_SEARCHES } from '@edu-forum/shared';
import { ALERT_JOBS, SavedService } from '../src/modules/saved/saved.service';
import { liveVacancy, publishedTeacher } from './fixtures';
import { createTestApp, deleteTestUsers, verifiedUser, type TestApp } from './utils';

describe('Saved items and searches (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  it('teachers save jobs; closed jobs stay, marked closed; unsave', async () => {
    const poster = await verifiedUser(t, 'director');
    const v = await liveVacancy(t, poster);
    const teacher = await publishedTeacher(t);

    const saved = await t.http.post('/api/v1/saved').set('Authorization', teacher.auth).send({ itemType: 'vacancy', itemId: v.id }).expect(201);
    expect(saved.body).toMatchObject({ itemType: 'vacancy', itemId: v.id, vacancy: { title: 'SS2 Physics Teacher', closed: false } });
    // Saving twice is harmless.
    await t.http.post('/api/v1/saved').set('Authorization', teacher.auth).send({ itemType: 'vacancy', itemId: v.id }).expect(201);
    await t.http.post('/api/v1/saved').set('Authorization', teacher.auth).send({ itemType: 'teacher', itemId: teacher.profileId }).expect(422);

    await t.http.post(`/api/v1/vacancies/${v.id}/close`).set('Authorization', poster.auth).send({ reason: 'filled' }).expect(200);
    const list = await t.http.get('/api/v1/saved').set('Authorization', teacher.auth).expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].vacancy.closed).toBe(true);
    const one = await t.http.get(`/api/v1/saved?itemId=${v.id}`).set('Authorization', teacher.auth).expect(200);
    expect(one.body.data[0].id).toBe(saved.body.id);

    const other = await publishedTeacher(t);
    await t.http.delete(`/api/v1/saved/${saved.body.id}`).set('Authorization', other.auth).expect(404);
    await t.http.delete(`/api/v1/saved/${saved.body.id}`).set('Authorization', teacher.auth).expect(204);
    expect((await t.http.get('/api/v1/saved').set('Authorization', teacher.auth).expect(200)).body.meta.total).toBe(0);
  });

  it('principals/directors save teachers; no address or coordinates; hidden profiles show unavailable', async () => {
    const leader = await verifiedUser(t, 'principal');
    const teacher = await publishedTeacher(t, 'Kemi Ade');
    const saved = await t.http.post('/api/v1/saved').set('Authorization', leader.auth).send({ itemType: 'teacher', itemId: teacher.profileId }).expect(201);
    expect(saved.body.teacher).toMatchObject({ fullName: 'Kemi Ade', available: true });
    const text = JSON.stringify(saved.body);
    expect(text).not.toContain('Secret Close');
    expect(text).not.toMatch(/"lat"|"lng"|addressLine/);

    await t.prisma.teacherProfile.update({ where: { id: teacher.profileId }, data: { isPublished: false } });
    const list = await t.http.get('/api/v1/saved').set('Authorization', leader.auth).expect(200);
    expect(list.body.data[0].teacher.available).toBe(false);
    const other = await publishedTeacher(t);
    await t.prisma.teacherProfile.update({ where: { id: other.profileId }, data: { isPublished: false } });
    await t.http.post('/api/v1/saved').set('Authorization', leader.auth).send({ itemType: 'teacher', itemId: other.profileId }).expect(404);
  });

  it('saved searches: create, edit, delete, validated filters, max 10', async () => {
    const teacher = await publishedTeacher(t);
    const created = await t.http
      .post('/api/v1/saved-searches')
      .set('Authorization', teacher.auth)
      .send({ name: 'Physics in Lagos', filters: { subjects: 'physics', state: 'lagos', page: '2', sort: 'salary' } })
      .expect(201);
    expect(created.body).toMatchObject({ scope: 'vacancies', name: 'Physics in Lagos', alertFrequency: 'daily', filters: { subjects: 'physics', state: 'lagos' } });
    expect(created.body.filters.page).toBeUndefined();

    const bad = await t.http.post('/api/v1/saved-searches').set('Authorization', teacher.auth).send({ name: 'x', filters: { radiusKm: '7', lat: '6.5', lng: '3.3' } }).expect(400);
    expect(bad.body.error.details.issues[0].path).toBe('filters.radiusKm');

    const edited = await t.http.patch(`/api/v1/saved-searches/${created.body.id}`).set('Authorization', teacher.auth).send({ alertFrequency: 'weekly' }).expect(200);
    expect(edited.body).toMatchObject({ alertFrequency: 'weekly', name: 'Physics in Lagos', filters: { subjects: 'physics' } });

    const other = await verifiedUser(t, 'director');
    await t.http.patch(`/api/v1/saved-searches/${created.body.id}`).set('Authorization', other.auth).send({ name: 'mine' }).expect(404);
    expect((await t.http.get('/api/v1/saved-searches').set('Authorization', other.auth).expect(200)).body).toEqual([]);
    // Principals/directors save teacher searches (scope from role).
    const leaderSearch = await t.http.post('/api/v1/saved-searches').set('Authorization', other.auth).send({ name: 'TRCN maths', filters: { subjects: 'mathematics', minExperience: '3' } }).expect(201);
    expect(leaderSearch.body.scope).toBe('teachers');

    for (let i = 1; i < MAX_SAVED_SEARCHES; i++) {
      await t.http.post('/api/v1/saved-searches').set('Authorization', teacher.auth).send({ name: `Search ${i}`, filters: {} }).expect(201);
    }
    await t.http.post('/api/v1/saved-searches').set('Authorization', teacher.auth).send({ name: 'One too many', filters: {} }).expect(422);
    await t.http.delete(`/api/v1/saved-searches/${created.body.id}`).set('Authorization', teacher.auth).expect(204);
    await t.http.post('/api/v1/saved-searches').set('Authorization', teacher.auth).send({ name: 'Fits again', filters: {} }).expect(201);
  });

  it('alerts list only new matches, once, and respect the frequency', async () => {
    const tag = `qz${Date.now().toString(36)}`;
    const teacher = await publishedTeacher(t);
    const instant = await t.http.post('/api/v1/saved-searches').set('Authorization', teacher.auth).send({ name: 'Instant', filters: { q: tag }, alertFrequency: 'instant' }).expect(201);
    await t.http.post('/api/v1/saved-searches').set('Authorization', teacher.auth).send({ name: 'Daily', filters: { q: tag } }).expect(201);
    const poster = await verifiedUser(t, 'director');
    await liveVacancy(t, poster, { title: `Chemistry Teacher ${tag}` });
    await liveVacancy(t, poster, { title: `Biology Teacher ${tag}` });

    expect(t.queue.scheduled).toEqual(expect.arrayContaining(Object.values(ALERT_JOBS).map((j) => j.name)));
    await t.queue.run(ALERT_JOBS.instant.name);
    const mail = t.mailer.lastTo(teacher.email)!;
    expect(mail.subject).toBe(`2 new jobs for “Instant” on EDU-FORUM`);
    expect(mail.text).toContain(`Chemistry Teacher ${tag}`);
    expect(mail.text).toContain(`/teacher/jobs?q=${tag}`);
    const notices = await t.http.get('/api/v1/notifications').set('Authorization', teacher.auth).expect(200);
    expect(notices.body.data[0]).toMatchObject({ type: 'saved_search_match', title: '2 new jobs for “Instant”' });

    // Nothing new: no second alert.
    expect(await t.app.get(SavedService).sendAlerts('instant')).toBe(0);
    expect((await t.prisma.savedSearch.findUniqueOrThrow({ where: { id: instant.body.id } })).lastAlertedAt).not.toBeNull();
    // The daily search still has both.
    await t.queue.run(ALERT_JOBS.daily.name);
    expect(t.mailer.lastTo(teacher.email)?.subject).toBe(`2 new jobs for “Daily” on EDU-FORUM`);

    // Switched-off categories still notify in-app, but send no email.
    await t.http.put('/api/v1/notifications/preferences').set('Authorization', teacher.auth).send({ email: { alerts: false } }).expect(200);
    await liveVacancy(t, poster, { title: `Physics Teacher ${tag}` });
    const before = t.mailer.sent.length;
    await t.queue.run(ALERT_JOBS.instant.name);
    expect(t.mailer.sent.length).toBe(before);
  });

  it('principal/director alerts: newly published matching teachers', async () => {
    const leader = await verifiedUser(t, 'director');
    const tag = `Zx${Date.now().toString(36)}`;
    await t.http.post('/api/v1/saved-searches').set('Authorization', leader.auth).send({ name: 'New physics teachers', filters: { q: tag }, alertFrequency: 'instant' }).expect(201);
    const teacher = await publishedTeacher(t, `Tobi ${tag}`);
    await t.prisma.teacherProfile.update({ where: { id: teacher.profileId }, data: { publishedAt: new Date() } });
    await t.queue.run(ALERT_JOBS.instant.name);
    const mail = t.mailer.lastTo(leader.email)!;
    expect(mail.subject).toBe(`1 new teacher for “New physics teachers” on EDU-FORUM`);
    expect(mail.text).toContain(`Tobi ${tag}`);
    expect(mail.text).not.toContain('Secret Close');
  });
});
