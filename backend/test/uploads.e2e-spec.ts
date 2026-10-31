import { UploadsService } from '../src/modules/uploads/uploads.service';
import { createTestApp, deleteTestUsers, PDF, PNG, uploadFile, verifiedUser, type TestApp } from './utils';

const SIGN = '/api/v1/uploads/sign';
const MB = 1024 * 1024;

describe('Uploads (e2e)', () => {
  let t: TestApp;
  let auth: string;

  beforeAll(async () => {
    t = await createTestApp();
    ({ auth } = await verifiedUser(t));
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  const sign = (body: object) => t.http.post(SIGN).set('Authorization', auth).send(body);

  it('signs a PUT URL for an allowed file', async () => {
    const res = await sign({ purpose: 'cv', fileName: 'cv.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 1000 }).expect(201);
    expect(res.body).toMatchObject({ method: 'PUT', headers: { 'Content-Type': expect.stringContaining('wordprocessingml') } });
    const minutes = (new Date(res.body.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(9);
    expect(minutes).toBeLessThanOrEqual(10);
  });

  it('rejects the wrong MIME type, a mismatched extension and files over 5 MB', async () => {
    const exe = await sign({ purpose: 'cv', fileName: 'cv.exe', mimeType: 'application/x-msdownload', sizeBytes: 1000 }).expect(400);
    expect(exe.body.error.details.issues[0]).toMatchObject({ path: 'mimeType', message: 'File must be PDF, DOC or DOCX' });

    const renamed = await sign({ purpose: 'cv', fileName: 'cv.exe', mimeType: 'application/pdf', sizeBytes: 1000 }).expect(400);
    expect(renamed.body.error.details.issues[0].path).toBe('fileName');

    const big = await sign({ purpose: 'cv', fileName: 'cv.pdf', mimeType: 'application/pdf', sizeBytes: 5 * MB + 1 }).expect(400);
    expect(big.body.error.details.issues[0].message).toBe('File must be 5 MB or smaller');
    await sign({ purpose: 'cv', fileName: 'cv.pdf', mimeType: 'application/pdf', sizeBytes: 5 * MB }).expect(201);

    await sign({ purpose: 'profile_photo', fileName: 'me.pdf', mimeType: 'application/pdf', sizeBytes: 10 }).expect(400);
    await sign({ purpose: 'identity_document', fileName: 'id.pdf', mimeType: 'application/pdf', sizeBytes: 10 }).expect(400);
  });

  it('rejects a file whose content does not match its type (e.g. an .exe renamed to .pdf)', async () => {
    const uploadId = await uploadFile(t, auth, 'cv', 'cv.pdf', 'application/pdf', Buffer.from('MZ\x90\x00 this is a windows program'));
    const res = await t.http.post('/api/v1/teachers/me/cv').set('Authorization', auth).send({ uploadId }).expect(400);
    expect(res.body.error.message).toBe('The file content does not match its type');
    const upload = await t.prisma.upload.findUniqueOrThrow({ where: { id: uploadId } });
    expect(t.storage.objects.has(upload.objectKey)).toBe(false);
  });

  it('rejects a stored file bigger than declared, or one that was never uploaded', async () => {
    const res = await sign({ purpose: 'cv', fileName: 'cv.pdf', mimeType: 'application/pdf', sizeBytes: 10 }).expect(201);
    await t.http.post('/api/v1/teachers/me/cv').set('Authorization', auth).send({ uploadId: res.body.uploadId }).expect(422);

    const key = String(res.body.url).replace('memory://put/', '');
    await t.storage.put(key, Buffer.concat([PDF, Buffer.alloc(100)]), 'application/pdf');
    await t.http.post('/api/v1/teachers/me/cv').set('Authorization', auth).send({ uploadId: res.body.uploadId }).expect(400);
  });

  it('an upload is used once, and only for its own purpose', async () => {
    const photo = await uploadFile(t, auth, 'profile_photo', 'me.png', 'image/png', PNG);
    await t.http.post('/api/v1/teachers/me/cv').set('Authorization', auth).send({ uploadId: photo }).expect(422);
    await t.http.post('/api/v1/teachers/me/photo').set('Authorization', auth).send({ uploadId: photo }).expect(201);
    await t.http.post('/api/v1/teachers/me/photo').set('Authorization', auth).send({ uploadId: photo }).expect(409);
  });

  it('requires a verified account', async () => {
    const res = await t.http
      .post('/api/v1/auth/register')
      .send({ email: `unverified-${Date.now()}@e2e.edu-forum.test`, password: 'teach2026', role: 'teacher', consent: true });
    await t.http
      .post(SIGN)
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .send({ purpose: 'cv', fileName: 'cv.pdf', mimeType: 'application/pdf', sizeBytes: 10 })
      .expect(403);
  });

  it('purges uploads that were signed but never used after a day', async () => {
    const res = await sign({ purpose: 'cv', fileName: 'abandoned.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length }).expect(201);
    const key = String(res.body.url).replace('memory://put/', '');
    await t.storage.put(key, PDF, 'application/pdf');
    await t.prisma.upload.update({ where: { id: res.body.uploadId }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } });
    await t.app.get(UploadsService).purgeUnclaimed();
    expect(t.storage.objects.has(key)).toBe(false);
    expect((await t.prisma.upload.findUniqueOrThrow({ where: { id: res.body.uploadId } })).deletedAt).not.toBeNull();
  });

  describe('POST /webhooks/storage/scan-result', () => {
    const HOOK = '/api/v1/webhooks/storage/scan-result';

    it('needs the shared secret', async () => {
      await t.http.post(HOOK).send({ uploadId: crypto.randomUUID(), status: 'clean' }).expect(401);
      await t.http.post(HOOK).set('x-webhook-secret', 'wrong').send({ uploadId: crypto.randomUUID(), status: 'clean' }).expect(401);
    });

    it('applies a provider scan result to a waiting upload', async () => {
      const user = await verifiedUser(t);
      const upload = await t.prisma.upload.create({
        data: {
          userId: user.userId,
          purpose: 'profile_photo',
          objectKey: `profile_photo/${user.userId}/${crypto.randomUUID()}.png`,
          fileName: 'me.png',
          mimeType: 'image/png',
          sizeBytes: PNG.length,
          confirmedAt: new Date(),
        },
      });
      await t.storage.put(upload.objectKey, PNG, 'image/png');
      await t.prisma.teacherProfile.create({ data: { userId: user.userId } });

      await t.http
        .post(HOOK)
        .set('x-webhook-secret', process.env.SCAN_WEBHOOK_SECRET!)
        .send({ uploadId: upload.id, status: 'clean' })
        .expect(204);
      const profile = await t.prisma.teacherProfile.findUniqueOrThrow({ where: { userId: user.userId } });
      expect(profile.photoKey).toBe(upload.objectKey);
      // A second result for the same upload is refused.
      await t.http
        .post(HOOK)
        .set('x-webhook-secret', process.env.SCAN_WEBHOOK_SECRET!)
        .send({ uploadId: upload.id, status: 'infected' })
        .expect(404);
    });
  });
});
