import { randomUUID } from 'node:crypto';
import { PDF, verifiedUser, type SignedInUser, type TestApp } from './utils';

const LONG = 'We are looking for a committed Physics teacher to plan lessons, mark scripts, prepare students for WAEC and NECO, and run the science laboratory.';

export type TestVacancy = { id: string; screeningQuestions: { id: string }[] };

async function lagosIkeja(t: TestApp) {
  const lagos = await t.prisma.state.findUniqueOrThrow({ where: { slug: 'lagos' } });
  const ikeja = await t.prisma.lga.findFirstOrThrow({ where: { stateId: lagos.id, slug: 'ikeja' } });
  return { lagos, ikeja };
}

/** A signed-in teacher with a published profile and an active, clean CV in memory storage. */
export async function publishedTeacher(t: TestApp, fullName = 'Ada Okafor'): Promise<SignedInUser & { profileId: string }> {
  const { lagos, ikeja } = await lagosIkeja(t);
  const user = await verifiedUser(t, 'teacher');
  const profile = await t.prisma.teacherProfile.create({
    data: {
      userId: user.userId,
      fullName,
      stateId: lagos.id,
      lgaId: ikeja.id,
      lat: 6.6,
      lng: 3.35,
      addressLine: '12 Secret Close',
      subjects: ['physics'],
      levels: ['sss'],
      jobTypes: ['full_time'],
      yearsExperience: 4,
      isPublished: true,
    },
  });
  const cvKey = `cv/${user.userId}/${randomUUID()}.pdf`;
  await t.storage.put(cvKey, PDF, 'application/pdf');
  await t.prisma.cv.create({
    data: { teacherId: profile.id, objectKey: cvKey, fileName: 'cv.pdf', mimeType: 'pdf', sizeBytes: 10, isActive: true, scanStatus: 'clean' },
  });
  return { ...user, profileId: profile.id };
}

/** A live vacancy with one yes/no screening question. */
export async function liveVacancy(t: TestApp, by: SignedInUser, over: Record<string, unknown> = {}): Promise<TestVacancy> {
  const { lagos, ikeja } = await lagosIkeja(t);
  const res = await t.http
    .post('/api/v1/vacancies')
    .set('Authorization', by.auth)
    .send({
      title: 'SS2 Physics Teacher',
      subjects: ['physics'],
      levels: ['sss'],
      jobType: 'full_time',
      salaryMin: 150_000,
      salaryMax: 220_000,
      description: `<p>${LONG}</p>`,
      schoolName: 'Greenfield Academy',
      stateId: lagos.id,
      lgaId: ikeja.id,
      lat: 6.6,
      lng: 3.35,
      screeningQuestions: [{ question: 'Are you TRCN registered?', type: 'yes_no' }],
      publish: true,
      ...over,
    })
    .expect(201);
  return res.body as TestVacancy;
}

export const yes = (v: TestVacancy) => [{ questionId: v.screeningQuestions[0].id, answer: 'yes' }];
