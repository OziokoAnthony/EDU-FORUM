import type { MemoryConverter } from '../src/infra/converter/document-converter';
import { DOCUMENT_CONVERTER } from '../src/infra/converter/document-converter';
import { EICAR } from '../src/infra/scanner/virus-scanner';
import { CvService } from '../src/modules/cv/cv.service';
import { createTestApp, deleteTestUsers, DOCX, PDF, uploadFile, verifiedUser, type TestApp } from './utils';

const CV = '/api/v1/teachers/me/cv';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('CV pipeline (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  async function uploadCv(auth: string, fileName = 'cv.pdf', mime = 'application/pdf', body = PDF) {
    const uploadId = await uploadFile(t, auth, 'cv', fileName, mime, body);
    return t.http.post(CV).set('Authorization', auth).send({ uploadId }).expect(201);
  }

  it('a clean PDF becomes the active CV with 10-minute signed links', async () => {
    const { auth } = await verifiedUser(t);
    const res = await uploadCv(auth);
    expect(res.body).toMatchObject({ isActive: true, scanStatus: 'clean', mimeType: 'pdf', fileName: 'cv.pdf' });
    expect(res.body.downloadUrl).toMatch(/^memory:\/\/get\/cv\/.+\.pdf\?download=cv\.pdf$/);
    expect(res.body.viewUrl).toMatch(/^memory:\/\/get\/cv\/.+\.pdf$/);

    const mine = await t.http.get(CV).set('Authorization', auth).expect(200);
    expect(mine.body.active.id).toBe(res.body.id);
    expect(mine.body.pending).toEqual([]);
  });

  it('DOCX is converted to PDF for the viewer; the original stays downloadable', async () => {
    const { auth } = await verifiedUser(t);
    const res = await uploadCv(auth, 'My CV.docx', DOCX_MIME, DOCX);
    expect(res.body).toMatchObject({ isActive: true, mimeType: 'docx' });
    expect(res.body.downloadUrl).toContain('.docx?download=My%20CV.docx');
    expect(res.body.viewUrl).toMatch(/\.pdf$/);
    expect(t.app.get<MemoryConverter>(DOCUMENT_CONVERTER).converted).toContain('My CV.docx');
    const cv = await t.prisma.cv.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(t.storage.objects.get(cv.pdfKey!)?.body.toString()).toMatch(/^%PDF/);
  });

  it('replacing keeps the old version in history; only old versions can be deleted', async () => {
    const { auth } = await verifiedUser(t);
    const first = await uploadCv(auth, 'old.pdf');
    const second = await uploadCv(auth, 'new.pdf');

    const mine = await t.http.get(CV).set('Authorization', auth).expect(200);
    expect(mine.body.active).toMatchObject({ id: second.body.id, fileName: 'new.pdf' });
    const history = await t.http.get(`${CV}/history`).set('Authorization', auth).expect(200);
    expect(history.body.data).toEqual([expect.objectContaining({ id: first.body.id, isActive: false, replacedAt: expect.any(String) })]);
    expect(history.body.data[0].downloadUrl).toContain('download=old.pdf');

    const active = await t.http.delete(`${CV}/${second.body.id}`).set('Authorization', auth).expect(422);
    expect(active.body.error.message).toMatch(/active CV cannot be deleted/);
    await t.http.delete(`${CV}/${first.body.id}`).set('Authorization', auth).expect(204);
    expect((await t.http.get(`${CV}/history`).set('Authorization', auth)).body.data).toEqual([]);

    const row = await t.prisma.cv.findUniqueOrThrow({ where: { id: first.body.id } });
    expect(t.storage.objects.has(row.objectKey)).toBe(false);
  });

  it('an infected CV is rejected, deleted from storage, and never replaces the active one', async () => {
    const { auth } = await verifiedUser(t);
    const good = await uploadCv(auth, 'good.pdf');
    const bad = await uploadCv(auth, 'bad.pdf', 'application/pdf', Buffer.concat([PDF, Buffer.from(EICAR)]));
    expect(bad.body).toMatchObject({ scanStatus: 'infected', isActive: false, downloadUrl: null, viewUrl: null });

    const mine = await t.http.get(CV).set('Authorization', auth).expect(200);
    expect(mine.body.active.id).toBe(good.body.id);
    expect(mine.body.pending).toEqual([expect.objectContaining({ id: bad.body.id, scanStatus: 'infected' })]);
    const row = await t.prisma.cv.findUniqueOrThrow({ where: { id: bad.body.id } });
    expect(t.storage.objects.has(row.objectKey)).toBe(false);
  });

  it('a teacher cannot see or delete another teacher\'s CV', async () => {
    const a = await verifiedUser(t);
    const b = await verifiedUser(t);
    const cv = await uploadCv(a.auth);
    await t.http.delete(`${CV}/${cv.body.id}`).set('Authorization', b.auth).expect(404);
    const mine = await t.http.get(CV).set('Authorization', b.auth).expect(200);
    expect(mine.body).toEqual({ active: null, pending: [] });
    // Another teacher's upload id cannot be attached either.
    const uploadId = await uploadFile(t, a.auth, 'cv', 'cv.pdf', 'application/pdf', PDF);
    await t.http.post(CV).set('Authorization', b.auth).send({ uploadId }).expect(404);
  });

  it('nightly purge deletes versions replaced more than 90 days ago', async () => {
    const { auth } = await verifiedUser(t);
    const old = await uploadCv(auth, 'ancient.pdf');
    const recent = await uploadCv(auth, 'recent.pdf');
    await uploadCv(auth, 'current.pdf');
    await t.prisma.cv.update({ where: { id: old.body.id }, data: { replacedAt: new Date(Date.now() - 91 * 86_400_000) } });

    const purged = await t.app.get(CvService).purgeOld();
    expect(purged).toBeGreaterThanOrEqual(1);
    const rows = await t.prisma.cv.findMany({ where: { id: { in: [old.body.id, recent.body.id] } } });
    expect(rows.find((r) => r.id === old.body.id)?.deletedAt).not.toBeNull();
    expect(rows.find((r) => r.id === recent.body.id)?.deletedAt).toBeNull();
    expect(t.storage.objects.has(rows.find((r) => r.id === old.body.id)!.objectKey)).toBe(false);
  });
});
