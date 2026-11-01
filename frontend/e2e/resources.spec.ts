import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CV_PDF } from './helpers';

function seededAdmin(): { email: string; password: string } | null {
  try {
    const env = readFileSync(join(__dirname, '..', '..', 'backend', '.env'), 'utf8');
    const get = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.trim().replace(/^"|"$/g, '');
    const email = get('SEED_ADMIN_EMAIL');
    const password = get('SEED_ADMIN_PASSWORD');
    return email && password ? { email, password } : null;
  } catch {
    return null;
  }
}

test('admin adds a calendar date, a teaching material and an exam timetable; visitors see them', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough: it uploads real files');
  test.setTimeout(240_000);
  const admin = seededAdmin();
  test.skip(!admin, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set in backend/.env');
  const stamp = Date.now().toString(36);
  const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(admin!.email);
  await page.getByLabel('Password').fill(admin!.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Resources', exact: true }).click();

  // Calendar date.
  await page.getByRole('tab', { name: 'School calendar' }).click();
  await page.getByLabel('Title').fill(`Resumption test ${stamp}`);
  await page.getByLabel('Start date').fill(soon);
  await page.getByRole('button', { name: 'Add date' }).click();
  await expect(page.getByText('Date added.')).toBeVisible();

  // Teaching material.
  await page.getByRole('tab', { name: 'Teaching materials' }).click();
  await page.getByLabel('Title').fill(`JSS1 Basic Science lesson note ${stamp}`);
  await page.getByLabel('Description').fill('Lesson note on living and non-living things for JSS 1, with activities and assessment questions.');
  await page.getByLabel('Class (optional)').selectOption({ label: 'JSS 1' });
  await page.getByLabel('File').setInputFiles({ name: 'lesson-note.pdf', mimeType: 'application/pdf', buffer: CV_PDF });
  await page.getByRole('button', { name: 'Upload material' }).click();
  await expect(page.getByText('Uploaded. It appears on the site')).toBeVisible();

  // Exam timetable.
  await page.getByRole('tab', { name: 'Exam timetables' }).click();
  await page.getByLabel('Exam').selectOption({ label: 'BECE' });
  await page.getByLabel('Session').fill(`Test ${stamp}`);
  await page.getByLabel('File').setInputFiles({ name: 'bece.pdf', mimeType: 'application/pdf', buffer: CV_PDF });
  await page.getByRole('button', { name: 'Upload timetable' }).click();
  await expect(page.getByText('Uploaded. It appears on the exam page')).toBeVisible();

  // A signed-out visitor: the date on the calendar and home page, the material (sign in to download), the timetable.
  const visitor = await browser.newPage();
  await visitor.goto('/calendar');
  await expect(visitor.getByText(`Resumption test ${stamp}`)).toBeVisible();
  await visitor.goto('/');
  await expect(visitor.getByRole('heading', { name: 'School calendar' })).toBeVisible();
  await expect.poll(
    async () => {
      await visitor.goto(`/resources?q=${stamp}`);
      return visitor.getByRole('link', { name: new RegExp(`lesson note ${stamp}`) }).count();
    },
    { timeout: 90_000, intervals: [3000] },
  ).toBe(1);
  await visitor.getByRole('link', { name: new RegExp(`lesson note ${stamp}`) }).click();
  await expect(visitor.getByRole('heading', { level: 1, name: new RegExp(`lesson note ${stamp}`) })).toBeVisible();
  await expect(visitor.getByRole('link', { name: 'Sign in to download' })).toBeVisible();
  await expect.poll(
    async () => {
      await visitor.goto('/exams/bece');
      return visitor.getByRole('heading', { name: `Test ${stamp} ${new Date().getFullYear()}` }).count();
    },
    { timeout: 90_000, intervals: [3000] },
  ).toBe(1);
  await expect(visitor.getByRole('link', { name: 'Download timetable' }).first()).toBeVisible();
  await visitor.close();
});
