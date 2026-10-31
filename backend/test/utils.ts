import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MAILER, type MemoryMailer } from '../src/infra/mail/mailer';
import { JOB_QUEUE, type InlineJobQueue } from '../src/infra/queue/job-queue';
import { OBJECT_STORAGE, type MemoryStorage } from '../src/infra/storage/object-storage';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { SMS_SENDER, type MemorySmsSender } from '../src/infra/sms/sms-sender';

/** Every test account uses this domain so suites can clean up after themselves. */
export const TEST_EMAIL_DOMAIN = 'e2e.edu-forum.test';

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  prisma: PrismaService;
  mailer: MemoryMailer;
  sms: MemorySmsSender;
  storage: MemoryStorage;
  queue: InlineJobQueue;
  close(): Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return {
    app,
    http: request(app.getHttpServer()),
    prisma,
    mailer: app.get(MAILER),
    sms: app.get(SMS_SENDER),
    storage: app.get(OBJECT_STORAGE),
    queue: app.get(JOB_QUEUE),
    close: () => app.close(),
  };
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${Date.now()}-${randomInt(1e6)}@${TEST_EMAIL_DOMAIN}`;
}

/** Random valid Nigerian mobile in local form (0803…) and E.164 (+234803…). */
export function uniquePhone(): { local: string; e164: string } {
  const rest = randomInt(10_000_000, 99_999_999).toString();
  return { local: `0803${rest.slice(0, 7)}`, e164: `+234803${rest.slice(0, 7)}` };
}

export function linkToken(text: string): string {
  const match = /token=([\w-]+)/.exec(text);
  if (!match) throw new Error(`No token in: ${text}`);
  return match[1];
}

export function otpCode(text: string): string {
  const match = /\b(\d{6})\b/.exec(text);
  if (!match) throw new Error(`No code in: ${text}`);
  return match[1];
}

/** Extracts the refresh cookie pair ("ef_rt=…") from a response. */
export function refreshCookie(res: { headers: Record<string, unknown> }): string {
  const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
  const cookie = cookies.find((c) => c.startsWith('ef_rt=') && !c.startsWith('ef_rt=;'));
  if (!cookie) throw new Error('No refresh cookie set');
  return cookie.split(';')[0];
}

export async function deleteTestUsers(prisma: PrismaService, phones: string[] = []): Promise<void> {
  const users = await prisma.user.findMany({
    where: { OR: [{ email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } }, { phone: { in: phones } }] },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;
  const teacherId = { teacher: { userId: { in: ids } } };
  await prisma.cv.deleteMany({ where: teacherId });
  await prisma.qualification.deleteMany({ where: teacherId });
  await prisma.certification.deleteMany({ where: teacherId });
  await prisma.workExperience.deleteMany({ where: teacherId });
  const schools = await prisma.schoolMember.findMany({ where: { userId: { in: ids } }, select: { schoolId: true } });
  const schoolIds = [...new Set(schools.map((s) => s.schoolId))];
  await prisma.schoolInvite.deleteMany({ where: { OR: [{ schoolId: { in: schoolIds } }, { invitedById: { in: ids } }] } });
  await prisma.schoolMember.deleteMany({ where: { OR: [{ schoolId: { in: schoolIds } }, { userId: { in: ids } }] } });
  await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
  await prisma.upload.deleteMany({ where: { userId: { in: ids } } });
  await prisma.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

export interface SignedInUser {
  email: string;
  userId: string;
  auth: string;
}

/** Registers and verifies (by email link) a teacher or school owner. */
export async function verifiedUser(t: TestApp, role: 'teacher' | 'school' = 'teacher'): Promise<SignedInUser> {
  const email = uniqueEmail(role);
  const res = await t.http
    .post('/api/v1/auth/register')
    .send({ email, password: 'teach2026', role, consent: true })
    .expect(201);
  await t.http
    .post('/api/v1/auth/verify-email')
    .send({ token: linkToken(t.mailer.lastTo(email)!.text) })
    .expect(200);
  return { email, userId: res.body.user.id, auth: `Bearer ${res.body.accessToken}` };
}

export const PDF = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
export const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('word/document.xml')]);
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

/**
 * Signs an upload and "PUTs" the bytes into memory storage, like the browser would.
 * Returns the upload id to pass to the feature endpoint.
 */
export async function uploadFile(
  t: TestApp,
  auth: string,
  purpose: string,
  fileName: string,
  mimeType: string,
  body: Buffer,
): Promise<string> {
  const res = await t.http
    .post('/api/v1/uploads/sign')
    .set('Authorization', auth)
    .send({ purpose, fileName, mimeType, sizeBytes: body.length })
    .expect(201);
  const key = String(res.body.url).replace('memory://put/', '');
  await t.storage.put(key, body, mimeType);
  return res.body.uploadId;
}
