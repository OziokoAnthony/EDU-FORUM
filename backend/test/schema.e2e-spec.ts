import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { PrismaService } from '../src/infra/prisma/prisma.service';

loadEnv();

// Port Harcourt city centre and two points ~3 km and ~460 km (Lagos) away.
const PH = { lat: 4.8156, lng: 7.0498 };
const NEAR = { lat: 4.84, lng: 7.03 };
const LAGOS = { lat: 6.5244, lng: 3.3792 };

describe('Database schema rules (e2e, needs docker postgres)', () => {
  const prisma = new PrismaService(new ConfigService(process.env));
  const slug = `schema-test-${Date.now()}`;
  let userId: string;
  let teacherId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `${slug}@test.local`, role: 'teacher' } });
    userId = user.id;
    teacherId = (await prisma.teacherProfile.create({ data: { userId, ...PH } })).id;
  });

  afterAll(async () => {
    await prisma.teacherProfile.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('fills geog from lat/lng via trigger', async () => {
    const [row] = await prisma.$queryRaw<{ has_geog: boolean }[]>`
      SELECT geog IS NOT NULL AS has_geog FROM teacher_profiles WHERE id = ${teacherId}::uuid`;
    expect(row.has_geog).toBe(true);
  });

  it('ST_DWithin finds the teacher within 10 km but not from Lagos', async () => {
    const within = (p: { lat: number; lng: number }) => prisma.$queryRaw<{ km: number }[]>`
      SELECT ST_Distance(geog, ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography) / 1000 AS km
      FROM teacher_profiles
      WHERE id = ${teacherId}::uuid
        AND ST_DWithin(geog, ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography, 10000)`;
    const near = await within(NEAR);
    expect(near).toHaveLength(1);
    expect(near[0].km).toBeGreaterThan(1);
    expect(near[0].km).toBeLessThan(10);
    expect(await within(LAGOS)).toHaveLength(0);
  });

  it('clears geog when coordinates are removed', async () => {
    await prisma.teacherProfile.update({ where: { id: teacherId }, data: { lat: null, lng: null } });
    const [row] = await prisma.$queryRaw<{ has_geog: boolean }[]>`
      SELECT geog IS NOT NULL AS has_geog FROM teacher_profiles WHERE id = ${teacherId}::uuid`;
    expect(row.has_geog).toBe(false);
  });

  it('rejects a vacancy with salary_min > salary_max', async () => {
    const state = await prisma.state.findUniqueOrThrow({ where: { slug: 'rivers' }, include: { lgas: { take: 1 } } });
    const poster = await prisma.user.create({ data: { email: `${slug}-director@test.local`, role: 'director' } });
    try {
      await expect(
        prisma.vacancy.create({
          data: {
            createdById: poster.id,
            schoolName: 'Schema Test School',
            slug: 'bad-salary',
            shortId: slug.slice(-8),
            title: 'Bad salary',
            jobType: 'full_time',
            salaryMin: 200_000,
            salaryMax: 100_000,
            description: 'x'.repeat(120),
            stateId: state.id,
            lgaId: state.lgas[0].id,
            locationVisibility: 'listed',
          },
        }),
      ).rejects.toThrow(/vacancies_salary_check/);
    } finally {
      await prisma.user.delete({ where: { id: poster.id } });
    }
  });
});
