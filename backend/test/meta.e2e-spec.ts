import { createTestApp, deleteTestUsers, verifiedUser, type TestApp } from './utils';

describe('/meta reference data (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  it('lists subjects, levels, qualification and certification types publicly, cacheable', async () => {
    const subjects = await t.http.get('/api/v1/meta/subjects').expect(200);
    expect(subjects.headers['cache-control']).toBe('public, max-age=3600');
    expect(subjects.body.data).toEqual(expect.arrayContaining([{ id: expect.any(String), name: 'Mathematics', slug: 'mathematics' }]));

    const levels = await t.http.get('/api/v1/meta/levels').expect(200);
    expect(levels.body.data.map((l: { slug: string }) => l.slug)).toEqual(['nursery', 'primary', 'jss', 'sss', 'tertiary']);

    const quals = await t.http.get('/api/v1/meta/qualification-types').expect(200);
    expect(quals.body.data[0]).toMatchObject({ name: 'OND', rank: 10 });

    const certs = await t.http.get('/api/v1/meta/certification-types').expect(200);
    expect(certs.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'TRCN Registration', issuer: 'Teachers Registration Council of Nigeria' })]),
    );
  });

  it('lists the country, 36 states + FCT, and the LGAs of a state by slug or id', async () => {
    const countries = await t.http.get('/api/v1/meta/locations/countries').expect(200);
    expect(countries.body.data).toEqual([{ code: 'NG', name: 'Nigeria' }]);

    const states = await t.http.get('/api/v1/meta/locations/states').expect(200);
    expect(states.body.data).toHaveLength(37);

    const bySlug = await t.http.get('/api/v1/meta/locations/lgas?state=lagos').expect(200);
    expect(bySlug.body.data).toHaveLength(20);
    const lagos = states.body.data.find((s: { slug: string }) => s.slug === 'lagos');
    const byId = await t.http.get(`/api/v1/meta/locations/lgas?state=${lagos.id}`).expect(200);
    expect(byId.body.data).toEqual(bySlug.body.data);

    await t.http.get('/api/v1/meta/locations/lgas?state=atlantis').expect(404);
    await t.http.get('/api/v1/meta/locations/lgas').expect(400);
  });

  it('geocode needs a signed-in user (stub returns no results locally)', async () => {
    await t.http.get('/api/v1/meta/geocode?q=Allen Avenue Ikeja').expect(401);
    const { auth } = await verifiedUser(t);
    const res = await t.http.get('/api/v1/meta/geocode?q=Allen Avenue Ikeja').set('Authorization', auth).expect(200);
    expect(res.body).toEqual({ data: [] });
  });
});
