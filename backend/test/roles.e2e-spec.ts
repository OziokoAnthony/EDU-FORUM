import { Controller, Get, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { RequireVerified, Roles } from '../src/common/auth/decorators';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { deleteTestUsers, linkToken, uniqueEmail } from './utils';
import { MAILER, type MemoryMailer } from '../src/infra/mail/mailer';

@Controller('test-roles')
class RolesProbeController {
  @Roles('teacher') @Get('teacher') teacher() { return { ok: true }; }
  @Roles('school') @Get('school') school() { return { ok: true }; }
  @Roles('admin') @Get('admin') admin() { return { ok: true }; }
  @RequireVerified() @Get('verified') verified() { return { ok: true }; }
}

@Module({ controllers: [RolesProbeController] })
class ProbeModule {}

describe('Role guards (e2e)', () => {
  let http: ReturnType<typeof request>;
  let close: () => Promise<void>;
  let prisma: PrismaService;
  let mailer: MemoryMailer;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, ProbeModule] }).compile();
    const app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    mailer = app.get(MAILER);
    close = () => app.close();

    for (const role of ['teacher', 'school'] as const) {
      const email = uniqueEmail(role);
      const res = await http.post('/api/v1/auth/register').send({ email, password: 'teach2026', role, consent: true });
      tokens[role] = res.body.accessToken;
      tokens[`${role}Email`] = email;
    }
  });

  afterAll(async () => {
    await deleteTestUsers(prisma);
    await close();
  });

  it.each([
    ['teacher', 'teacher', 200],
    ['teacher', 'school', 403],
    ['teacher', 'admin', 403],
    ['school', 'school', 200],
    ['school', 'teacher', 403],
    ['school', 'admin', 403],
  ])('%s → /%s = %i', async (who, route, status) => {
    await http.get(`/api/v1/test-roles/${route}`).set('Authorization', `Bearer ${tokens[who]}`).expect(status);
  });

  it('@RequireVerified blocks unverified users with reason UNVERIFIED, then allows them', async () => {
    const res = await http.get('/api/v1/test-roles/verified').set('Authorization', `Bearer ${tokens.teacher}`).expect(403);
    expect(res.body.error.details).toEqual({ reason: 'UNVERIFIED' });

    const token = linkToken(mailer.lastTo(tokens.teacherEmail)!.text);
    await http.post('/api/v1/auth/verify-email').send({ token }).expect(200);
    await http.get('/api/v1/test-roles/verified').set('Authorization', `Bearer ${tokens.teacher}`).expect(200);
  });
});
