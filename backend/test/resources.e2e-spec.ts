import { hash } from '@node-rs/argon2';
import { EICAR } from '../src/infra/scanner/virus-scanner';
import { createTestApp, deleteTestUsers, PDF, PNG, uniqueEmail, uploadFile, verifiedUser, type SignedInUser, type TestApp } from './utils';

describe('Resources: teaching materials, calendar, exam timetables (e2e)', () => {
  let t: TestApp;
  let admin: SignedInUser;

  beforeAll(async () => {
    t = await createTestApp();
    const email = uniqueEmail('admin');
    const u = await t.prisma.user.create({ data: { email, role: 'admin', passwordHash: await hash('admin2026x'), emailVerifiedAt: new Date() } });
    const res = await t.http.post('/api/v1/auth/login').send({ identifier: email, password: 'admin2026x' }).expect(200);
    admin = { email, userId: u.id, auth: `Bearer ${res.body.accessToken}` };
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  it('only admins upload materials; everyone browses; members download a counted, short-lived link', async () => {
    const teacher = await verifiedUser(t);
    await t.http.post('/api/v1/uploads/sign').set('Authorization', teacher.auth).send({ purpose: 'teaching_material', fileName: 'notes.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length }).expect(403);

    const uploadId = await uploadFile(t, admin.auth, 'teaching_material', 'ss2-physics.pdf', 'application/pdf', PDF);
    const title = `SS2 Physics scheme of work first term ${Date.now()}`;
    const m = await t.http
      .post('/api/v1/admin/materials')
      .set('Authorization', admin.auth)
      .send({ title, description: 'Week-by-week topics, objectives and activities for SS2 Physics, first term.', kind: 'scheme_of_work', subject: 'physics', classLevel: 'ss-2', term: 'first', uploadId })
      .expect(201);
    expect(m.body).toMatchObject({ kind: 'scheme_of_work', subject: { slug: 'physics' }, classLevel: { slug: 'ss-2', name: 'SS 2' }, term: 'first', fileType: 'PDF' });

    const list = await t.http.get(`/api/v1/materials?classLevel=ss-2&q=${encodeURIComponent('scheme of work')}&limit=50`).expect(200);
    expect(list.body.data.some((x: { id: string }) => x.id === m.body.id)).toBe(true);
    const page = await t.http.get(`/api/v1/materials/by-slug/${m.body.slug}`).expect(200);
    expect(page.body.title).toBe(title);

    await t.http.get(`/api/v1/materials/${m.body.id}/download`).expect(401);
    const dl = await t.http.get(`/api/v1/materials/${m.body.id}/download`).set('Authorization', teacher.auth).expect(200);
    expect(dl.body.url).toMatch(/^memory:\/\/get\//);
    expect((await t.http.get(`/api/v1/materials/by-slug/${m.body.slug}`).expect(200)).body.downloads).toBe(1);

    // Teachers cannot use the admin endpoints; deleting hides it.
    await t.http.post('/api/v1/admin/materials').set('Authorization', teacher.auth).send({}).expect(403);
    await t.http.delete(`/api/v1/admin/materials/${m.body.id}`).set('Authorization', admin.auth).expect(204);
    await t.http.get(`/api/v1/materials/by-slug/${m.body.slug}`).expect(404);
  });

  it('an infected file never appears', async () => {
    const uploadId = await uploadFile(t, admin.auth, 'teaching_material', 'bad.pdf', 'application/pdf', Buffer.concat([PDF, Buffer.from(EICAR)]));
    const m = await t.http
      .post('/api/v1/admin/materials')
      .set('Authorization', admin.auth)
      .send({ title: 'Suspicious lesson note file', description: 'This file carries a test virus signature and must be removed.', kind: 'lesson_note', uploadId })
      .expect(201);
    await t.http.get(`/api/v1/materials/by-slug/${m.body.slug}`).expect(404);
    expect((await t.prisma.teachingMaterial.findUniqueOrThrow({ where: { id: m.body.id } })).deletedAt).not.toBeNull();
  });

  it('calendar dates: national and per state, upcoming only, ordered', async () => {
    const lagos = await t.prisma.state.findFirstOrThrow({ where: { slug: 'lagos' } });
    const kano = await t.prisma.state.findFirstOrThrow({ where: { slug: 'kano' } });
    const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const tag = `T${Date.now()}`;
    const add = (body: Record<string, unknown>, status = 201) => t.http.post('/api/v1/admin/calendar').set('Authorization', admin.auth).send(body).expect(status);
    await add({ title: `${tag} Second term resumes`, kind: 'resumption', startDate: future(10) });
    await add({ title: `${tag} Lagos mid-term break`, kind: 'midterm_break', startDate: future(20), endDate: future(22), stateId: lagos.id });
    await add({ title: `${tag} Kano mid-term break`, kind: 'midterm_break', startDate: future(21), stateId: kano.id });
    await add({ title: `${tag} Last year`, kind: 'other', startDate: future(-400) });
    await add({ title: 'Bad dates', kind: 'other', startDate: future(5), endDate: future(1) }, 400);

    const all = (await t.http.get('/api/v1/calendar?limit=200').expect(200)).body.filter((e: { title: string }) => e.title.startsWith(tag));
    expect(all.map((e: { title: string }) => e.title.replace(`${tag} `, ''))).toEqual(['Second term resumes', 'Lagos mid-term break', 'Kano mid-term break']);
    const lagosOnly = (await t.http.get('/api/v1/calendar?state=lagos&limit=200').expect(200)).body.filter((e: { title: string }) => e.title.startsWith(tag));
    expect(lagosOnly.map((e: { title: string }) => e.title.replace(`${tag} `, ''))).toEqual(['Second term resumes', 'Lagos mid-term break']);
    expect(lagosOnly[1]).toMatchObject({ kind: 'midterm_break', state: { slug: 'lagos' }, endDate: future(22) });
  });

  it('exam timetables: admins upload the official file; anyone sees the exam page and downloads it', async () => {
    const exams = await t.http.get('/api/v1/exams').expect(200);
    expect(exams.body.map((e: { slug: string }) => e.slug)).toEqual(expect.arrayContaining(['waec', 'neco', 'nabteb', 'jamb-utme', 'bece', 'common-entrance', 'first-school-leaving', 'ielts', 'trcn-pqe']));
    const waec = exams.body.find((e: { slug: string }) => e.slug === 'waec');

    const uploadId = await uploadFile(t, admin.auth, 'exam_timetable', 'wassce-2027.png', 'image/png', PNG);
    const tt = await t.http
      .post('/api/v1/admin/exams/timetables')
      .set('Authorization', admin.auth)
      .send({ examId: waec.id, year: 2027, session: 'May/June', startDate: '2027-04-26', endDate: '2027-06-20', uploadId })
      .expect(201);
    const page = await t.http.get('/api/v1/exams/waec').expect(200);
    expect(page.body.timetables[0]).toMatchObject({ id: tt.body.id, year: 2027, session: 'May/June', startDate: '2027-04-26', ready: true, fileType: 'Image' });
    const file = await t.http.get(`/api/v1/exams/timetables/${tt.body.id}/file`).expect(302);
    expect(file.headers.location).toMatch(/^memory:\/\/get\//);
    const sitemap = await t.http.get('/api/v1/seo/sitemap/resources').expect(200);
    expect(sitemap.body.data.map((e: { path: string }) => e.path)).toContain('/exams/waec');
    expect((await t.http.get('/api/v1/seo/meta?path=/exams/waec').expect(200)).body).toMatchObject({ h1: 'WAEC WASSCE timetable', indexable: true });

    await t.http.delete(`/api/v1/admin/exams/timetables/${tt.body.id}`).set('Authorization', admin.auth).expect(204);
    await t.http.get(`/api/v1/exams/timetables/${tt.body.id}/file`).expect(404);
  });
});
