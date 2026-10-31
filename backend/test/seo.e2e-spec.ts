import { SeoNotifier } from '../src/modules/seo/seo-notifier';
import { createTestApp, deleteTestUsers, verifiedUser, type SignedInUser, type TestApp } from './utils';

const LONG = 'We are looking for a committed teacher to plan lessons, mark scripts, prepare students for WAEC and NECO, and support every learner in class.';

describe('SEO (e2e)', () => {
  let t: TestApp;
  let director: SignedInUser;
  let ekiti: { id: string; slug: string };
  let adoLga: { id: string; slug: string };
  let notifier: SeoNotifier;

  beforeAll(async () => {
    t = await createTestApp();
    notifier = t.app.get(SeoNotifier);
    // A state other tests do not use, so counts are predictable.
    ekiti = await t.prisma.state.findUniqueOrThrow({ where: { slug: 'ekiti' } });
    adoLga = await t.prisma.lga.findFirstOrThrow({ where: { stateId: ekiti.id }, orderBy: { name: 'asc' } });
    await t.prisma.vacancy.updateMany({ where: { stateId: ekiti.id, status: 'published' }, data: { status: 'closed' } });
    director = await verifiedUser(t, 'director');
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  async function post(over: Record<string, unknown> = {}) {
    const res = await t.http
      .post('/api/v1/vacancies')
      .set('Authorization', director.auth)
      .send({
        title: 'SS2 Physics Teacher',
        subjects: ['physics'],
        levels: ['sss'],
        jobType: 'full_time',
        salaryMin: 120_000,
        salaryMax: 180_000,
        description: `<p>${LONG}</p>`,
        schoolName: 'Ekiti Grammar School',
        stateId: ekiti.id,
        lgaId: adoLga.id,
        publish: true,
        ...over,
      })
      .expect(201);
    return res.body as { id: string; slug: string; shortId: string };
  }

  it('job page by slug: canonical path, breadcrumbs, similar jobs; revalidation + Indexing ping on publish', async () => {
    const before = notifier.sent.length;
    const v = await post();
    expect(v.slug).toBe(`ss2-physics-teacher-${adoLga.slug}`);
    expect(notifier.sent.slice(before)).toEqual([{ path: `/jobs/${v.slug}-${v.shortId}`, shortId: v.shortId, type: 'URL_UPDATED' }]);
    const other = await post({ title: 'SS1 Physics Teacher' });

    const res = await t.http.get(`/api/v1/vacancies/by-slug/${v.slug}-${v.shortId}`).expect(200);
    expect(res.body).toMatchObject({
      canonicalPath: `/jobs/${v.slug}-${v.shortId}`,
      vacancy: { id: v.id, schoolName: 'Ekiti Grammar School' },
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Jobs', path: '/jobs' },
        { name: 'Ekiti', path: '/jobs/ekiti' },
        { name: expect.any(String), path: `/jobs/ekiti/${adoLga.slug}` },
        { name: 'SS2 Physics Teacher', path: `/jobs/${v.slug}-${v.shortId}` },
      ],
    });
    expect(res.body.similar.map((s: { id: string }) => s.id)).toContain(other.id);
    expect(res.body.similar.map((s: { id: string }) => s.id)).not.toContain(v.id);
    // Any slug text works with the right short id; a wrong short id does not.
    await t.http.get(`/api/v1/vacancies/by-slug/anything-${v.shortId}`).expect(200);
    await t.http.get('/api/v1/vacancies/by-slug/ss2-physics-teacher-zzzzzzzz').expect(404);
  });

  it('closed job: still served (noindex) for 30 days, then 410 Gone; drafts are 404', async () => {
    const v = await post();
    const before = notifier.sent.length;
    await t.http.post(`/api/v1/vacancies/${v.id}/close`).set('Authorization', director.auth).send({ reason: 'filled' }).expect(200);
    expect(notifier.sent.slice(before)).toEqual([expect.objectContaining({ type: 'URL_DELETED', shortId: v.shortId })]);

    const path = `${v.slug}-${v.shortId}`;
    const closed = await t.http.get(`/api/v1/vacancies/by-slug/${path}`).expect(200);
    expect(closed.body.vacancy.status).toBe('closed');
    const meta = await t.http.get(`/api/v1/seo/meta?path=/jobs/${path}`).expect(200);
    expect(meta.body).toMatchObject({ kind: 'job', indexable: false, title: expect.stringMatching(/^Closed:/) });

    await t.prisma.vacancy.update({ where: { id: v.id }, data: { closedAt: new Date(Date.now() - 31 * 86_400_000) } });
    const gone = await t.http.get(`/api/v1/vacancies/by-slug/${path}`).expect(410);
    expect(gone.body.error.code).toBe('GONE');

    const draft = await post({ publish: false });
    await t.http.get(`/api/v1/vacancies/by-slug/${draft.slug}-${draft.shortId}`).expect(404);
  });

  it('meta: landing pages are indexable only with 3+ live jobs; titles and filters per page type', async () => {
    const lgaPath = `/jobs/ekiti/${adoLga.slug}`;
    // Start from whatever earlier tests left live in this LGA, then top up to exactly 3.
    const start = (await t.http.get(`/api/v1/seo/meta?path=${lgaPath}`)).body.liveJobs as number;
    for (let i = start; i < 2; i++) await post({ title: `Chemistry Teacher ${i}`, subjects: ['chemistry'] });
    const two = await t.http.get(`/api/v1/seo/meta?path=${lgaPath}`).expect(200);
    if (two.body.liveJobs < 3) expect(two.body.indexable).toBe(false);
    while ((await t.http.get(`/api/v1/seo/meta?path=${lgaPath}`)).body.liveJobs < 3) await post({ title: 'Biology Teacher', subjects: ['biology'] });

    const lga = await t.http.get(`/api/v1/seo/meta?path=${lgaPath}`).expect(200);
    expect(lga.body).toMatchObject({ kind: 'lga', indexable: true, filters: { state: 'ekiti', lga: adoLga.slug }, canonical: lgaPath });
    expect(lga.body.title).toMatch(/^Teaching jobs in .+, Ekiti$/);

    const state = await t.http.get('/api/v1/seo/meta?path=/jobs/ekiti').expect(200);
    expect(state.body).toMatchObject({ kind: 'state', h1: 'Teaching jobs in Ekiti', indexable: true });
    expect(state.body.description.length).toBeLessThanOrEqual(160);

    const stateSubject = await t.http.get('/api/v1/seo/meta?path=/jobs/ekiti/physics-teacher').expect(200);
    expect(stateSubject.body).toMatchObject({ kind: 'state_subject', title: 'Physics teacher jobs in Ekiti', filters: { state: 'ekiti', subject: 'physics' } });

    const subject = await t.http.get('/api/v1/seo/meta?path=/jobs/subject/physics').expect(200);
    expect(subject.body).toMatchObject({ kind: 'subject', title: 'Physics teacher jobs in Nigeria' });

    await t.http.get('/api/v1/seo/meta?path=/jobs/atlantis').expect(404);
    await t.http.get('/api/v1/seo/meta?path=/jobs/ekiti/not-a-place').expect(404);
    const home = await t.http.get('/api/v1/seo/meta?path=/').expect(200);
    expect(home.body.kind).toBe('home');
  });

  it('landing-pages lists only combinations with enough live jobs; sitemap lists live jobs only', async () => {
    const res = await t.http.get('/api/v1/seo/landing-pages').expect(200);
    const paths = res.body.data.map((p: { path: string }) => p.path);
    expect(paths).toContain('/jobs/ekiti');
    expect(paths).toContain(`/jobs/ekiti/${adoLga.slug}`);
    for (const p of res.body.data) expect(p.liveJobs).toBeGreaterThanOrEqual(3);

    const draft = await post({ publish: false });
    const sitemap = await t.http.get('/api/v1/seo/sitemap/vacancies').expect(200);
    const urls = sitemap.body.data.map((e: { path: string }) => e.path);
    expect(urls).not.toContain(`/jobs/${draft.slug}-${draft.shortId}`);
    expect(sitemap.body.data[0]).toMatchObject({ path: expect.stringMatching(/^\/jobs\/.+-[a-z2-9]{8}$/), lastmod: expect.any(String) });
  });

  it('the slug is frozen after publish even if the title changes', async () => {
    const v = await post();
    const edited = await t.http.patch(`/api/v1/vacancies/${v.id}`).set('Authorization', director.auth).send({ title: 'Head of Science' }).expect(200);
    expect(edited.body.slug).toBe(v.slug);
    await t.http.get(`/api/v1/vacancies/by-slug/${v.slug}-${v.shortId}`).expect(200);
  });
});
