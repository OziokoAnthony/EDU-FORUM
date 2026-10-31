/**
 * Idempotent seed: safe to run repeatedly (upserts by unique keys, never deletes).
 * Run with `pnpm --filter @edu-forum/backend db:seed`.
 */
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { slugify } from '@edu-forum/shared';
import { PrismaClient } from '../../src/generated/prisma/client';
import { NIGERIA_STATES, STATE_SLUG_OVERRIDES } from './data/nigeria';
import {
  AD_SLOTS,
  CERTIFICATION_TYPES,
  LEVELS,
  QUALIFICATION_TYPES,
  SUBJECTS,
} from './data/reference';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seedLocations() {
  await prisma.country.upsert({
    where: { code: 'NG' },
    update: {},
    create: { code: 'NG', name: 'Nigeria' },
  });

  for (const [stateName, lgas] of Object.entries(NIGERIA_STATES)) {
    const slug = STATE_SLUG_OVERRIDES[stateName] ?? slugify(stateName);
    const state = await prisma.state.upsert({
      where: { slug },
      update: {},
      create: { countryCode: 'NG', name: stateName, slug },
    });
    await prisma.lga.createMany({
      data: lgas.map((name) => ({ stateId: state.id, name, slug: slugify(name) })),
      skipDuplicates: true,
    });
  }
}

async function seedReferenceLists() {
  await prisma.level.createMany({
    data: LEVELS.map((name, i) => ({ name, slug: slugify(name), sortOrder: i })),
    skipDuplicates: true,
  });
  await prisma.subject.createMany({
    data: SUBJECTS.map((name, i) => ({ name, slug: slugify(name), sortOrder: i })),
    skipDuplicates: true,
  });
  await prisma.qualificationType.createMany({
    data: QUALIFICATION_TYPES.map(({ name, rank }) => ({ name, slug: slugify(name), rank })),
    skipDuplicates: true,
  });
  await prisma.certificationType.createMany({
    data: CERTIFICATION_TYPES.map(({ name, issuer }) => ({ name, slug: slugify(name), issuer })),
    skipDuplicates: true,
  });
  await prisma.adSettings.createMany({
    data: AD_SLOTS.map((slot) => ({ ...slot, enabled: false })),
    skipDuplicates: true,
  });
}

/** First admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD; never overwrites an existing password. */
async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('Skipping admin: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one.');
    return;
  }
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await hash(password),
      role: 'admin',
      emailVerifiedAt: new Date(),
      consentAcceptedAt: new Date(),
    },
  });
  console.log(`Admin account: ${email}`);
}

async function main() {
  await seedLocations();
  await seedReferenceLists();
  await seedAdmin();
  const [states, lgas, subjects, levels, qualificationTypes, certificationTypes] =
    await Promise.all([
      prisma.state.count(),
      prisma.lga.count(),
      prisma.subject.count(),
      prisma.level.count(),
      prisma.qualificationType.count(),
      prisma.certificationType.count(),
    ]);
  console.log({ states, lgas, subjects, levels, qualificationTypes, certificationTypes });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
