import { createTestApp, deleteTestUsers, PDF, PNG, uploadFile, verifiedUser, type TestApp } from './utils';

const API = '/api/v1/teachers/me';

describe('Teacher onboarding (e2e)', () => {
  let t: TestApp;
  let lagos: { id: string; slug: string };
  let ikeja: { id: string };
  let oyoLga: { id: string };
  let bed: { id: string };
  let trcn: { id: string };

  beforeAll(async () => {
    t = await createTestApp();
    lagos = await t.prisma.state.findUniqueOrThrow({ where: { slug: 'lagos' } });
    ikeja = await t.prisma.lga.findFirstOrThrow({ where: { stateId: lagos.id, slug: 'ikeja' } });
    oyoLga = await t.prisma.lga.findFirstOrThrow({ where: { state: { slug: 'oyo' } } });
    bed = await t.prisma.qualificationType.findUniqueOrThrow({ where: { name: 'B.Ed.' } });
    trcn = await t.prisma.certificationType.findUniqueOrThrow({ where: { name: 'TRCN Registration' } });
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  const personal = { fullName: 'Ada Okafor', gender: 'female', dob: '1994-05-12' };
  const location = () => ({ stateId: lagos.id, lgaId: ikeja.id, area: 'Allen Avenue', addressLine: '12 Secret Close', lat: 6.6018, lng: 3.3515 });
  const preferences = { subjects: ['mathematics', 'physics'], levels: ['sss'], jobTypes: ['full_time'] };
  const qualification = () => ({ qualificationTypeId: bed.id, course: 'Mathematics Education', institution: 'University of Lagos', yearObtained: 2017 });
  const experience = { schoolName: 'Kings College', role: 'Maths teacher', startDate: '2018-01-08', endDate: '2022-07-29' };

  async function completeProfile(auth: string) {
    await t.http.patch(`${API}/personal`).set('Authorization', auth).send(personal).expect(200);
    await t.http.put(`${API}/location`).set('Authorization', auth).send(location()).expect(200);
    await t.http.put(`${API}/preferences`).set('Authorization', auth).send(preferences).expect(200);
    await t.http.post(`${API}/qualifications`).set('Authorization', auth).send(qualification()).expect(201);
    await t.http.post(`${API}/experiences`).set('Authorization', auth).send(experience).expect(201);
    const uploadId = await uploadFile(t, auth, 'cv', 'cv.pdf', 'application/pdf', PDF);
    await t.http.post(`${API}/cv`).set('Authorization', auth).send({ uploadId }).expect(201);
  }

  it('is for verified teachers only', async () => {
    const director = await verifiedUser(t, 'director');
    await t.http.get(API).set('Authorization', director.auth).expect(403);

    const res = await t.http
      .post('/api/v1/auth/register')
      .send({ email: `unverified-${Date.now()}@e2e.edu-forum.test`, password: 'teach2026', role: 'teacher', consent: true });
    await t.http.get(API).set('Authorization', `Bearer ${res.body.accessToken}`).expect(403);
    await t.http.get(API).expect(401);
  });

  it('publish fails with 422 listing exactly what is missing, then succeeds once complete', async () => {
    const { auth } = await verifiedUser(t);
    const empty = await t.http.post(`${API}/publish`).set('Authorization', auth).expect(422);
    expect(empty.body.error.code).toBe('BUSINESS_RULE');
    expect(empty.body.error.details.missing).toEqual(['cv', 'qualification', 'experience', 'preferences', 'location', 'personal']);

    await t.http.patch(`${API}/personal`).set('Authorization', auth).send(personal).expect(200);
    await t.http.put(`${API}/location`).set('Authorization', auth).send(location()).expect(200);
    const partial = await t.http.post(`${API}/publish`).set('Authorization', auth).expect(422);
    expect(partial.body.error.details.missing).toEqual(['cv', 'qualification', 'experience', 'preferences']);

    await t.http.put(`${API}/preferences`).set('Authorization', auth).send(preferences).expect(200);
    await t.http.post(`${API}/qualifications`).set('Authorization', auth).send(qualification()).expect(201);
    await t.http.post(`${API}/experiences`).set('Authorization', auth).send(experience).expect(201);
    const noCv = await t.http.post(`${API}/publish`).set('Authorization', auth).expect(422);
    expect(noCv.body.error.details.missing).toEqual(['cv']);

    const uploadId = await uploadFile(t, auth, 'cv', 'cv.pdf', 'application/pdf', PDF);
    await t.http.post(`${API}/cv`).set('Authorization', auth).send({ uploadId }).expect(201);
    const published = await t.http.post(`${API}/publish`).set('Authorization', auth).expect(200);
    expect(published.body).toMatchObject({ isPublished: true, completeness: { score: 85, missing: [], canPublish: true } });

    const unpublished = await t.http.post(`${API}/unpublish`).set('Authorization', auth).expect(200);
    expect(unpublished.body.isPublished).toBe(false);
  });

  it('a CV that fails the virus scan does not satisfy the publish gate', async () => {
    const { auth } = await verifiedUser(t);
    await t.http.patch(`${API}/personal`).set('Authorization', auth).send(personal);
    const uploadId = await uploadFile(
      t,
      auth,
      'cv',
      'cv.pdf',
      'application/pdf',
      Buffer.concat([PDF, Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')]),
    );
    await t.http.post(`${API}/cv`).set('Authorization', auth).send({ uploadId }).expect(201);
    const res = await t.http.get(`${API}/completeness`).set('Authorization', auth).expect(200);
    expect(res.body.missing).toContain('cv');
  });

  it('completeness: photo and bio add the last 15%', async () => {
    const { auth } = await verifiedUser(t);
    await completeProfile(auth);
    await t.http.patch(`${API}/personal`).set('Authorization', auth).send({ ...personal, bio: 'I love teaching maths.' }).expect(200);
    const photoId = await uploadFile(t, auth, 'profile_photo', 'me.png', 'image/png', PNG);
    const photo = await t.http.post(`${API}/photo`).set('Authorization', auth).send({ uploadId: photoId }).expect(201);
    expect(photo.body.scanStatus).toBe('clean');
    expect(photo.body.photoUrl).toContain('profile_photo/');
    const res = await t.http.get(`${API}/completeness`).set('Authorization', auth).expect(200);
    expect(res.body.score).toBe(100);
  });

  it('GET /teachers/me returns the teacher their own private address and stores geog from lat/lng', async () => {
    const { auth, userId } = await verifiedUser(t);
    await completeProfile(auth);
    const me = await t.http.get(API).set('Authorization', auth).expect(200);
    expect(me.body.location).toMatchObject({ state: { slug: 'lagos' }, lga: { slug: 'ikeja' }, addressLine: '12 Secret Close', lat: 6.6018 });
    expect(me.body.cv).toMatchObject({ isActive: true, scanStatus: 'clean', fileName: 'cv.pdf' });

    const [row] = await t.prisma.$queryRaw<{ x: number; y: number }[]>`
      SELECT ST_X(geog::geometry) AS x, ST_Y(geog::geometry) AS y FROM teacher_profiles WHERE user_id = ${userId}::uuid`;
    expect(row).toEqual({ x: 3.3515, y: 6.6018 });
  });

  describe('validation', () => {
    let auth: string;
    beforeAll(async () => ({ auth } = await verifiedUser(t)));

    it('personal: required fields and date of birth', async () => {
      const res = await t.http.patch(`${API}/personal`).set('Authorization', auth).send({ fullName: 'A', dob: '2999-01-01' }).expect(400);
      const paths = res.body.error.details.issues.map((i: { path: string }) => i.path);
      expect(paths).toEqual(expect.arrayContaining(['fullName', 'gender', 'dob']));
    });

    it('location: the LGA must be in the chosen state; a map pin needs both coordinates', async () => {
      const wrong = await t.http.put(`${API}/location`).set('Authorization', auth).send({ stateId: lagos.id, lgaId: oyoLga.id }).expect(400);
      expect(wrong.body.error.details.issues[0].path).toBe('lgaId');
      await t.http.put(`${API}/location`).set('Authorization', auth).send({ stateId: lagos.id, lgaId: ikeja.id, lat: 6.5 }).expect(400);
      const relocate = await t.http
        .put(`${API}/location`)
        .set('Authorization', auth)
        .send({ stateId: lagos.id, lgaId: ikeja.id, willingToRelocate: true, preferredStates: ['atlantis'] })
        .expect(400);
      expect(relocate.body.error.details.issues[0]).toMatchObject({ path: 'preferredStates.0' });
    });

    it('preferences: subjects and levels must be from the reference lists; salary min <= max', async () => {
      const res = await t.http
        .put(`${API}/preferences`)
        .set('Authorization', auth)
        .send({ ...preferences, subjects: ['mathematics', 'alchemy'] })
        .expect(400);
      expect(res.body.error.details.issues[0]).toMatchObject({ path: 'subjects.1' });
      await t.http
        .put(`${API}/preferences`)
        .set('Authorization', auth)
        .send({ ...preferences, expectedSalaryMin: 200000, expectedSalaryMax: 100000 })
        .expect(400);
      await t.http.put(`${API}/preferences`).set('Authorization', auth).send({ ...preferences, levels: [] }).expect(400);
    });

    it('certifications need a file, and expiry after issue', async () => {
      const base = { certificationTypeId: trcn.id, issuer: 'TRCN', number: 'TRCN/2020/1234', issuedAt: '2020-03-01' };
      const noFile = await t.http.post(`${API}/certifications`).set('Authorization', auth).send(base).expect(400);
      expect(noFile.body.error.details.issues[0].path).toBe('fileUploadId');
      const fileUploadId = await uploadFile(t, auth, 'certification_file', 'trcn.pdf', 'application/pdf', PDF);
      await t.http
        .post(`${API}/certifications`)
        .set('Authorization', auth)
        .send({ ...base, fileUploadId, expiresAt: '2019-01-01' })
        .expect(400);
      const ok = await t.http.post(`${API}/certifications`).set('Authorization', auth).send({ ...base, fileUploadId, expiresAt: '2026-03-01' }).expect(201);
      expect(ok.body).toMatchObject({ number: 'TRCN/2020/1234', hasFile: true, fileScanStatus: 'clean' });
    });

    it('experience: end date required unless current', async () => {
      await t.http.post(`${API}/experiences`).set('Authorization', auth).send({ ...experience, endDate: undefined }).expect(400);
      await t.http.post(`${API}/experiences`).set('Authorization', auth).send({ ...experience, endDate: '2017-01-01' }).expect(400);
      await t.http.post(`${API}/experiences`).set('Authorization', auth).send({ ...experience, endDate: undefined, isCurrent: true }).expect(201);
    });
  });

  it('qualifications: the last one cannot be deleted; files are attached once scanned', async () => {
    const { auth } = await verifiedUser(t);
    const fileUploadId = await uploadFile(t, auth, 'qualification_file', 'degree.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    const first = await t.http.post(`${API}/qualifications`).set('Authorization', auth).send({ ...qualification(), fileUploadId }).expect(201);
    expect(first.body).toMatchObject({ hasFile: true, fileScanStatus: 'clean', qualificationType: { name: 'B.Ed.' } });

    const last = await t.http.delete(`${API}/qualifications/${first.body.id}`).set('Authorization', auth).expect(422);
    expect(last.body.error.message).toMatch(/at least one qualification/);

    const second = await t.http.post(`${API}/qualifications`).set('Authorization', auth).send({ ...qualification(), course: 'PGDE' }).expect(201);
    await t.http.patch(`${API}/qualifications/${second.body.id}`).set('Authorization', auth).send({ yearObtained: 2019 }).expect(200);
    await t.http.delete(`${API}/qualifications/${first.body.id}`).set('Authorization', auth).expect(204);
    const list = await t.http.get(`${API}/qualifications`).set('Authorization', auth).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ course: 'PGDE', yearObtained: 2019 });
  });

  it('ownership: a teacher cannot edit or delete another teacher\'s records', async () => {
    const a = await verifiedUser(t);
    const b = await verifiedUser(t);
    const q = await t.http.post(`${API}/qualifications`).set('Authorization', a.auth).send(qualification()).expect(201);
    const e = await t.http.post(`${API}/experiences`).set('Authorization', a.auth).send(experience).expect(201);
    await t.http.patch(`${API}/qualifications/${q.body.id}`).set('Authorization', b.auth).send({ course: 'Hacked' }).expect(404);
    await t.http.delete(`${API}/qualifications/${q.body.id}`).set('Authorization', b.auth).expect(404);
    await t.http.patch(`${API}/experiences/${e.body.id}`).set('Authorization', b.auth).send({ role: 'Hacked' }).expect(404);
    await t.http.delete(`${API}/experiences/${e.body.id}`).set('Authorization', b.auth).expect(404);
    const list = await t.http.get(`${API}/qualifications`).set('Authorization', b.auth).expect(200);
    expect(list.body.data).toEqual([]);
  });

  it('experience: years are the union of job periods; NYSC alone means "no experience yet"', async () => {
    const { auth } = await verifiedUser(t);
    const nysc = await t.http
      .post(`${API}/experiences`)
      .set('Authorization', auth)
      .send({ kind: 'nysc', schoolName: 'Govt Secondary School, Ikeja', role: 'Corps member', startDate: '2023-01-10', endDate: '2023-12-10' })
      .expect(201);
    let me = await t.http.get(API).set('Authorization', auth);
    expect(me.body).toMatchObject({ noExperienceYet: true, yearsExperience: 0, completeness: { missing: expect.not.arrayContaining(['experience']) } });

    // Two overlapping jobs, 2018-01-01 → 2021-01-01 in total = 3 years.
    await t.http.post(`${API}/experiences`).set('Authorization', auth).send({ ...experience, startDate: '2018-01-01', endDate: '2020-01-01' });
    await t.http.post(`${API}/experiences`).set('Authorization', auth).send({ ...experience, startDate: '2019-06-01', endDate: '2021-01-01' });
    me = await t.http.get(API).set('Authorization', auth);
    expect(me.body).toMatchObject({ noExperienceYet: false, yearsExperience: 3 });
    expect(nysc.body.kind).toBe('nysc');
  });

  it('a published profile cannot drop its last experience entry', async () => {
    const { auth } = await verifiedUser(t);
    await completeProfile(auth);
    await t.http.post(`${API}/publish`).set('Authorization', auth).expect(200);
    const [only] = (await t.http.get(`${API}/experiences`).set('Authorization', auth)).body.data;
    await t.http.delete(`${API}/experiences/${only.id}`).set('Authorization', auth).expect(422);
    await t.http.post(`${API}/unpublish`).set('Authorization', auth).expect(200);
    await t.http.delete(`${API}/experiences/${only.id}`).set('Authorization', auth).expect(204);
  });

  it('/me/onboarding resumes at the first incomplete required step', async () => {
    const { auth } = await verifiedUser(t);
    await t.http.patch(`${API}/personal`).set('Authorization', auth).send(personal);
    await t.http.put(`${API}/location`).set('Authorization', auth).send(location());
    const res = await t.http.get('/api/v1/me/onboarding').set('Authorization', auth).expect(200);
    expect(res.body.nextStep).toBe('qualifications');
  });
});
