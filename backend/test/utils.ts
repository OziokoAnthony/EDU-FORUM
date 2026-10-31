import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MAILER, type MemoryMailer } from '../src/infra/mail/mailer';
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
  await prisma.teacherProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
