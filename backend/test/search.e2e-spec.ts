import { randomUUID } from 'node:crypto';
import { createTestApp, deleteTestUsers, PDF, uniqueEmail, uniquePhone, verifiedUser, type SignedInUser, type TestApp } from './utils';

const LONG = 'We are looking for a committed teacher to plan lessons, mark scripts, prepare students for WAEC and NECO, and support the school community every term.';

describe('Search (e2e)', () => {
  let t: TestApp;
  const tag = `zq${Date.now().toString(36)}`; // unique word so other test data never interferes
  let lagos: { id: string };
  let ikeja: { id: string };
  let etiOsa: { id: string };
  let oyo: { id: string; lgaId: string };
  let types: Record<string, { id: string }>;
  let director: SignedInUser;

  // Ikeja ~ (6.60, 3.35); Lekki ~ (6.44, 3.47) is about 22 km away.
  const IKEJA = { lat: 6.6, lng: 3.35 };
  const LEKKI = { lat: 6.44, lng: 3.47 };

  beforeAll(async () => {
    t = await createTestApp();
    lagos = await t.prisma.state.findUniqueOrThrow({ where: { slug: 'lagos' } });
    ikeja = await t.prisma.lga.findFirstOrThrow({ where: { stateId: lagos.id, slug: 'ikeja' } });
    etiOsa = await t.prisma.lga.findFirstOrThrow({ where: { stateId: lagos.id, slug: 'eti-osa' } });
    const oyoState = await t.prisma.state.findUniqueOrThrow({ where: { slug: 'oyo' }, include: { lgas: { take: 1 } } });
    oyo = { id: oyoState.id, lgaId: oyoState.lgas[0].id };
    const all = await Promise.all(
      ['nce', 'b-ed', 'm-ed'].map((slug) => t.prisma.qualificationType.findUniqueOrThrow({ where: { slug } })),
    );
    types = { nce: all[0], bed: all[1], med: all[2] };
    director = await verifiedUser(t, 'director');
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  /** A published teacher created straight in the database (search only reads). */
  async function teacher(name: string, over: Record<string, unknown> = {}, opts: { qual?: string; trcn?: boolean; cv?: boolean } = {}) {
    const user = await t.prisma.user.create({
      data: { email: uniqueEmail('search'), phone: null, role: 'teacher', emailVerifiedAt: new Date() },
    });
    const profile = await t.prisma.teacherProfile.create({
      data: {
        userId: user.id,
        fullName: `${name} ${tag}`,
        gender: 'female',
        dob: new Date('1990-01-01'),
        countryCode: 'NG',
        stateId: lagos.id,
        lgaId: ikeja.id,
        addressLine: '12 Secret Close',
        ...IKEJA,
        subjects: ['physics'],
        levels: ['sss'],
        jobTypes: ['full_time'],
        yearsExperience: 5,
        isPublished: true,
        publishedAt: new Date(),
        completenessScore: 85,
        ...over,
      },
    });
    await t.prisma.qualification.create({
      data: { teacherId: profile.id, qualificationTypeId: types[opts.qual ?? 'bed'].id, course: 'Physics Education', institution: 'UNILAG', yearObtained: 2015 },
    });
    if (opts.trcn) {
      const trcn = await t.prisma.certificationType.findUniqueOrThrow({ where: { slug: 'trcn-registration' } });
      await t.prisma.certification.create({ data: { teacherId: profile.id, certificationTypeId: trcn.id, issuer: 'TRCN', number: 'T1', issuedAt: new Date('2016-01-01') } });
    }
    if (opts.cv !== false) {
      const key = `cv/${user.id}/${randomUUID()}.pdf`;
      await t.storage.put(key, PDF, 'application/pdf');
      await t.prisma.cv.create({ data: { teacherId: profile.id, objectKey: key, fileName: 'cv.pdf', mimeType: 'pdf', sizeBytes: PDF.length, isActive: true, scanStatus: 'clean' } });
    }
    return { user, profile };
  }

  async function vacancy(by: SignedInUser, over: Record<string, unknown> = {}) {
    const res = await t.http
      .post('/api/v1/vacancies')
      .set('Authorization', by.auth)
      .send({
        title: `Physics Teacher ${tag}`,
        subjects: ['physics'],
        levels: ['sss'],
        jobType: 'full_time',
        salaryMin: 150_000,
        salaryMax: 250_000,
        description: `<p>${LONG}</p>`,
        schoolName: 'Searchable Academy',
        stateId: lagos.id,
        lgaId: ikeja.id,
        ...IKEJA,
        publish: true,
        ...over,
      })
      .expect(201);
    return res.body as { id: string };
  }

  const ids = (body: { data: { id: string }[] }) => body.data.map((d) => d.id);

  describe('GET /vacancies', () => {
    let near: { id: string };
    let far: { id: string };
    let maths: { id: string };
    let anon: { id: string };
    let draft: { id: string };

    beforeAll(async () => {
      near = await vacancy(director);
      far = await vacancy(director, { lgaId: etiOsa.id, ...LEKKI, salaryMin: 300_000, salaryMax: 400_000, jobType: 'part_time' });
      maths = await vacancy(director, { title: `Maths Teacher ${tag}`, subjects: ['mathematics'], levels: ['jss'], stateId: oyo.id, lgaId: oyo.lgaId, lat: null, lng: null });
      anon = await vacancy(director, { locationVisibility: 'anonymous', schoolName: 'Hidden College' });
      draft = await vacancy(director, { publish: false });
    });

    it('is public, lists live vacancies only, and filters', async () => {
      const all = await t.http.get(`/api/v1/vacancies?q=${tag}`).expect(200);
      expect(ids(all.body)).toEqual(expect.arrayContaining([near.id, far.id, maths.id, anon.id]));
      expect(ids(all.body)).not.toContain(draft.id);
      expect(all.body.data[0]).toMatchObject({ matchScore: null, excerpt: expect.stringMatching(/^We are looking/) });

      const q = (s: string) => t.http.get(`/api/v1/vacancies?q=${tag}&${s}`).expect(200).then((r) => ids(r.body));
      expect(await q('subjects=mathematics')).toEqual([maths.id]);
      expect(await q('levels=jss,primary')).toEqual([maths.id]);
      expect(await q('jobType=part_time')).toEqual([far.id]);
      expect(await q('salaryMin=280000')).toEqual([far.id]);
      expect(await q('state=oyo')).toEqual([maths.id]);
      expect((await q('state=lagos&lga=eti-osa'))).toEqual([far.id]);
      expect(await q('postedWithin=1')).toHaveLength(4);
    });

    it('distance: radius around a point, nearest first; anonymous ones show no distance', async () => {
      const res = await t.http.get(`/api/v1/vacancies?q=${tag}&lat=${IKEJA.lat}&lng=${IKEJA.lng}&radiusKm=10&sort=distance`).expect(200);
      expect(ids(res.body)).toEqual(expect.arrayContaining([near.id, anon.id]));
      expect(ids(res.body)).not.toContain(far.id);
      expect(res.body.data.find((d: { id: string }) => d.id === near.id).distanceKm).toBe(0);

      const wide = await t.http.get(`/api/v1/vacancies?q=${tag}&lat=${IKEJA.lat}&lng=${IKEJA.lng}&radiusKm=25&sort=distance`).expect(200);
      const farItem = wide.body.data.find((d: { id: string }) => d.id === far.id);
      expect(farItem.distanceKm).toBeGreaterThan(15);
      expect(farItem.distanceKm).toBeLessThan(25);
      const anonItem = wide.body.data.find((d: { id: string }) => d.id === anon.id);
      expect(anonItem).toMatchObject({ schoolLabel: 'Confidential school', isAnonymous: true, distanceKm: null });
      expect(JSON.stringify(wide.body)).not.toContain('Hidden College');
    });

    it('validates the query: radius options only, lat and lng together', async () => {
      await t.http.get('/api/v1/vacancies?lat=6.6&lng=3.3&radiusKm=7').expect(400);
      await t.http.get('/api/v1/vacancies?lat=6.6').expect(400);
      await t.http.get('/api/v1/vacancies?limit=51').expect(400);
    });

    it('a signed-in teacher gets match scores, ranked best first, from their saved location', async () => {
      const me = await verifiedUser(t, 'teacher');
      const profile = await t.prisma.teacherProfile.create({
        data: { userId: me.userId, subjects: ['physics'], levels: ['sss'], yearsExperience: 3, ...IKEJA, stateId: lagos.id, lgaId: ikeja.id },
      });
      await t.prisma.qualification.create({ data: { teacherId: profile.id, qualificationTypeId: types.bed.id, course: 'Physics', institution: 'UI', yearObtained: 2018 } });
      const res = await t.http.get(`/api/v1/vacancies?q=${tag}`).set('Authorization', me.auth).expect(200);
      const score = (id: string) => res.body.data.find((d: { id: string }) => d.id === id).matchScore;
      expect(score(near.id)).toBe(100);
      expect(score(maths.id)).toBeLessThan(score(far.id));
      // Best match first (the listed and anonymous Ikeja vacancies tie at 100).
      expect(res.body.data[0].matchScore).toBe(100);
      // Saved pin is the origin, so distance shows without lat/lng in the query.
      expect(res.body.data.find((d: { id: string }) => d.id === near.id).distanceKm).toBe(0);

      const rec = await t.http.get('/api/v1/vacancies/recommended').set('Authorization', me.auth).expect(200);
      expect(ids(rec.body)).toContain(near.id);
      expect(ids(rec.body)).not.toContain(maths.id);
      await t.http.get('/api/v1/vacancies/recommended').set('Authorization', director.auth).expect(403);
    });
  });

  describe('GET /teachers', () => {
    let ada: Awaited<ReturnType<typeof teacher>>;
    let bayo: Awaited<ReturnType<typeof teacher>>;
    let chika: Awaited<ReturnType<typeof teacher>>;
    let hidden: Awaited<ReturnType<typeof teacher>>;

    beforeAll(async () => {
      ada = await teacher('Ada', { yearsExperience: 8, expectedSalaryMin: 200_000 }, { qual: 'med', trcn: true });
      bayo = await teacher('Bayo', { lgaId: etiOsa.id, ...LEKKI, yearsExperience: 2, subjects: ['physics', 'chemistry'] }, { qual: 'nce' });
      chika = await teacher('Chika', { stateId: oyo.id, lgaId: oyo.lgaId, lat: null, lng: null, subjects: ['mathematics'], levels: ['jss'], willingToRelocate: true, preferredStates: ['lagos'], availableFrom: new Date('2030-01-01') });
      hidden = await teacher('Hidden', { isPublished: false });
    });

    const search = (s: string, auth = director.auth) => t.http.get(`/api/v1/teachers?q=${tag}&${s}`).set('Authorization', auth);

    it('is for principals and directors only, and lists published teachers only', async () => {
      const teacherUser = await verifiedUser(t, 'teacher');
      await search('', teacherUser.auth).expect(403);
      await t.http.get('/api/v1/teachers').expect(401);
      const principal = await verifiedUser(t, 'principal');
      const res = await search('', principal.auth).expect(200);
      expect(ids(res.body)).toEqual(expect.arrayContaining([ada.profile.id, bayo.profile.id, chika.profile.id]));
      expect(ids(res.body)).not.toContain(hidden.profile.id);
    });

    it('never returns the street address or map pin', async () => {
      const res = await search(`lat=${IKEJA.lat}&lng=${IKEJA.lng}`).expect(200);
      const json = JSON.stringify(res.body);
      expect(json).not.toContain('Secret Close');
      expect(json).not.toMatch(/"lat"|"lng"|addressLine|"6\.6"|"3\.35"/);
      const item = res.body.data.find((d: { id: string }) => d.id === ada.profile.id);
      expect(item).toMatchObject({ state: { slug: 'lagos' }, lga: { slug: 'ikeja' }, distanceKm: 0, highestQualification: 'M.Ed.', certifications: ['TRCN Registration'] });
    });

    it('filters: subjects, qualification (or higher), experience, certification, place, relocation, salary, availability', async () => {
      const q = (s: string) => search(s).expect(200).then((r) => ids(r.body));
      expect(await q('subjects=chemistry')).toEqual([bayo.profile.id]);
      // M.Ed. (higher) and B.Ed. match a B.Ed. filter; NCE does not.
      expect((await q('qualification=b-ed')).sort()).toEqual([ada.profile.id, chika.profile.id].sort());
      expect(await q('minExperience=6')).toEqual([ada.profile.id]);
      expect(await q('certification=trcn-registration')).toEqual([ada.profile.id]);
      expect(await q('state=lagos&lga=eti-osa')).toEqual([bayo.profile.id]);
      expect(await q(`lat=${IKEJA.lat}&lng=${IKEJA.lng}&radiusKm=10`)).toEqual([ada.profile.id]);
      expect((await q('state=lagos&willingToRelocate=true')).sort()).toEqual([ada.profile.id, bayo.profile.id, chika.profile.id].sort());
      expect(await q('state=oyo')).toEqual([chika.profile.id]);
      expect(await q('maxSalary=150000')).not.toContain(ada.profile.id);
      expect(await q('availableBy=2027-01-01')).not.toContain(chika.profile.id);
      await search('qualification=unknown-thing').expect(400);
    });

    it('sorts by match score (and experience on request)', async () => {
      const res = await search('subjects=physics&levels=sss&qualification=b-ed&minExperience=5&certification=trcn-registration').expect(200);
      expect(res.body.data[0]).toMatchObject({ id: ada.profile.id, matchScore: 90 }); // no origin: distance 0 of 10
      const byExp = await search('sort=experience').expect(200);
      expect(ids(byExp.body)[0]).toBe(ada.profile.id);
    });

    it('GET /teachers/:id shows the profile with phone and email, logs the view; unpublished is 404', async () => {
      const phone = uniquePhone().e164;
      await t.prisma.user.update({ where: { id: ada.user.id }, data: { phone } });
      const res = await t.http.get(`/api/v1/teachers/${ada.profile.id}`).set('Authorization', director.auth).expect(200);
      expect(res.body).toMatchObject({
        fullName: `Ada ${tag}`,
        phone,
        email: ada.user.email,
        qualifications: [expect.objectContaining({ type: 'M.Ed.' })],
        cv: { fileName: 'cv.pdf', mimeType: 'pdf' },
      });
      expect(JSON.stringify(res.body)).not.toContain('Secret Close');
      const views = await t.prisma.profileView.findMany({ where: { teacherId: ada.profile.id, viewerId: director.userId } });
      expect(views.map((v) => v.kind)).toContain('profile');
      await t.http.get(`/api/v1/teachers/${hidden.profile.id}`).set('Authorization', director.auth).expect(404);
    });

    it('GET /teachers/:id/cv gives a 10-minute view or download link and logs it', async () => {
      const view = await t.http.get(`/api/v1/teachers/${ada.profile.id}/cv`).set('Authorization', director.auth).expect(200);
      expect(view.body.url).toMatch(/^memory:\/\/get\/cv\/.+\.pdf$/);
      const minutes = (new Date(view.body.expiresAt).getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(9);
      const dl = await t.http.get(`/api/v1/teachers/${ada.profile.id}/cv?download=true`).set('Authorization', director.auth).expect(200);
      expect(dl.body.url).toContain('download=cv.pdf');
      const kinds = (await t.prisma.profileView.findMany({ where: { teacherId: ada.profile.id } })).map((v) => v.kind);
      expect(kinds).toEqual(expect.arrayContaining(['cv_view', 'cv_download']));

      const noCv = await teacher('NoCv', {}, { cv: false });
      await t.http.get(`/api/v1/teachers/${noCv.profile.id}/cv`).set('Authorization', director.auth).expect(404);
      const teacherUser = await verifiedUser(t, 'teacher');
      await t.http.get(`/api/v1/teachers/${ada.profile.id}/cv`).set('Authorization', teacherUser.auth).expect(403);
    });

    it('/teachers/me still belongs to the teacher', async () => {
      const teacherUser = await verifiedUser(t, 'teacher');
      await t.http.get('/api/v1/teachers/me').set('Authorization', teacherUser.auth).expect(200);
    });

    it('recommended teachers for a vacancy: poster only; same state or willing to relocate', async () => {
      const v = await vacancy(director, { title: `Recommend ${tag}` });
      const res = await t.http.get(`/api/v1/vacancies/${v.id}/recommended-teachers`).set('Authorization', director.auth).expect(200);
      const found = ids(res.body);
      expect(found).toEqual(expect.arrayContaining([ada.profile.id, bayo.profile.id]));
      expect(found).not.toContain(hidden.profile.id);
      expect(found).not.toContain(chika.profile.id); // maths/JSS only: no subject or level in common
      const other = await verifiedUser(t, 'principal');
      await t.http.get(`/api/v1/vacancies/${v.id}/recommended-teachers`).set('Authorization', other.auth).expect(404);
    });
  });
});
