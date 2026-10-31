import { expect, test, type Page } from '@playwright/test';

// Real stack: API dev server (BullMQ worker, Backblaze B2, ClamAV) + Mailpit.
const MAILPIT = 'http://localhost:8025/api/v1';
const API = 'http://localhost:4000/api/v1';
const CV_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

async function verifyToken(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const search = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) return /token=([\w-]+)/.exec((await fetch(`${MAILPIT}/message/${id}`).then((r) => r.json())).Text)![1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email for ${to}`);
}

/** Registers, verifies and returns an API caller for that account. */
async function account(email: string, role: 'teacher' | 'director') {
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'teach2026', role, consent: true }),
  }).then((r) => r.json());
  await fetch(`${API}/auth/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: await verifyToken(email) }) });
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${reg.accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
  return call;
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password').fill('teach2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('director finds a teacher and opens the CV; the teacher sees the job in recommendations', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now()}`;
  const tag = `zz${Date.now().toString(36)}`;
  const teacherEmail = `pw-find-t-${stamp}@e2e.edu-forum.test`;
  const directorEmail = `pw-find-d-${stamp}@e2e.edu-forum.test`;

  // A published teacher, built through the API with a real CV upload to B2 + ClamAV.
  const asTeacher = await account(teacherEmail, 'teacher');
  const states = (await fetch(`${API}/meta/locations/states`).then((r) => r.json())).data;
  const lagos = states.find((s: { slug: string }) => s.slug === 'lagos');
  const ikeja = (await fetch(`${API}/meta/locations/lgas?state=lagos`).then((r) => r.json())).data.find((l: { slug: string }) => l.slug === 'ikeja');
  const bed = (await fetch(`${API}/meta/qualification-types`).then((r) => r.json())).data.find((q: { slug: string }) => q.slug === 'b-ed');
  await asTeacher('/teachers/me/personal', 'PATCH', { fullName: `Ada ${tag}`, gender: 'female', dob: '1994-05-12' });
  await asTeacher('/teachers/me/location', 'PUT', { stateId: lagos.id, lgaId: ikeja.id, addressLine: '12 Secret Close', lat: 6.6, lng: 3.35 });
  await asTeacher('/teachers/me/preferences', 'PUT', { subjects: ['physics'], levels: ['sss'], jobTypes: ['full_time'] });
  await asTeacher('/teachers/me/qualifications', 'POST', { qualificationTypeId: bed.id, course: 'Physics Education', institution: 'UNILAG', yearObtained: 2017 });
  await asTeacher('/teachers/me/experiences', 'POST', { schoolName: 'Kings College', role: 'Physics teacher', startDate: '2018-01-08', isCurrent: true });
  const signed = await asTeacher('/uploads/sign', 'POST', { purpose: 'cv', fileName: 'ada-cv.pdf', mimeType: 'application/pdf', sizeBytes: CV_PDF.length });
  await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: CV_PDF });
  await asTeacher('/teachers/me/cv', 'POST', { uploadId: signed.uploadId });
  await expect.poll(async () => (await asTeacher('/teachers/me/cv')).active?.scanStatus, { timeout: 60_000 }).toBe('clean');
  await asTeacher('/teachers/me/publish', 'POST');

  // A director with a live vacancy.
  const asDirector = await account(directorEmail, 'director');
  await asDirector('/vacancies', 'POST', {
    title: `Physics Teacher ${tag}`,
    subjects: ['physics'],
    levels: ['sss'],
    jobType: 'full_time',
    salaryMin: 150000,
    salaryMax: 220000,
    description: '<p>We need a passionate Physics teacher for SS1 to SS3, preparing students for WAEC and NECO and running lab practicals.</p>',
    schoolName: 'Greenfield Academy',
    stateId: lagos.id,
    lgaId: ikeja.id,
    lat: 6.6,
    lng: 3.35,
    publish: true,
  });

  // Director: search → profile with contact details → view CV.
  await signIn(page, directorEmail);
  await expect(page).toHaveURL(/\/hiring$/);
  await page.getByRole('link', { name: 'Find teachers' }).click();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.getByLabel('Keyword').fill(tag);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('1 teacher found')).toBeVisible();
  await expect(page.getByText('Secret Close')).toHaveCount(0);
  await page.getByRole('link', { name: new RegExp(`Ada ${tag}`) }).click();
  await expect(page.getByRole('heading', { name: `Ada ${tag}` })).toBeVisible();
  await expect(page.getByRole('link', { name: teacherEmail })).toBeVisible();
  await expect(page.getByText('Secret Close')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  // Headless Chromium downloads PDFs rather than showing them, so check the request it makes.
  const [cvRequest] = await Promise.all([
    page.context().waitForEvent('request', { predicate: (r) => r.url().includes('backblazeb2.com'), timeout: 15_000 }),
    page.getByRole('button', { name: 'View CV' }).click(),
  ]);
  expect(cvRequest.url()).toMatch(/X-Amz-Expires=600/);

  // Teacher: the director's vacancy is among the recommendations, with a match score.
  const teacherPage = await browser.newPage();
  await signIn(teacherPage, teacherEmail);
  await expect(teacherPage).toHaveURL(/\/teacher$/);
  await teacherPage.getByRole('link', { name: /Find teaching jobs/ }).click();
  const card = teacherPage.getByRole('listitem').filter({ hasText: `Physics Teacher ${tag}` });
  await expect(card).toBeVisible();
  await expect(card.getByText('100% match')).toBeVisible();
  await card.getByRole('link').click();
  await expect(teacherPage.getByRole('heading', { name: `Physics Teacher ${tag}` })).toBeVisible();
  await expect(teacherPage.getByText('Greenfield Academy')).toBeVisible();
  await teacherPage.close();
});
