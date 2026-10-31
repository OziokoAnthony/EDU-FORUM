import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { account, liveVacancy, signIn } from './helpers';

/** The seeded admin (backend/.env, git-ignored); the suite skips if it is not configured. */
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

test('teacher reports a job; admin takes it down, resolves the report and suspends the poster', async ({ page, browser }, info) => {
  test.setTimeout(150_000);
  const admin = seededAdmin();
  test.skip(!admin, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set in backend/.env');
  const stamp = `${info.project.name}-${Date.now()}`;
  const tag = `zm${Date.now().toString(36)}`;
  const teacherEmail = `pw-mod-t-${stamp}@e2e.edu-forum.test`;
  const directorEmail = `pw-mod-d-${stamp}@e2e.edu-forum.test`;

  await account(teacherEmail, 'teacher');
  const asDirector = await account(directorEmail, 'director');
  const vacancy = await liveVacancy(asDirector, `Scam Job ${tag}`);

  // Teacher reports the job.
  await signIn(page, teacherEmail);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto(`/teacher/jobs/${vacancy.id}`);
  await page.getByRole('button', { name: 'Report this job' }).click();
  await page.getByLabel('What is wrong?').selectOption('scam_or_fraud');
  await page.getByLabel('Details (optional)').fill('They asked me to pay a registration fee.');
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Thanks. Our team will review this.')).toBeVisible();

  // Admin works the queue. Reasons are asked with browser prompts.
  const adminPage = await browser.newPage();
  const answers: string[] = [];
  adminPage.on('dialog', (d) => void d.accept(answers.shift() ?? ''));
  await adminPage.goto('/login');
  await adminPage.getByLabel('Email or phone number').fill(admin!.email);
  await adminPage.getByLabel('Password').fill(admin!.password);
  await adminPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(adminPage).toHaveURL(/\/admin$/);
  await expect(adminPage.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await adminPage.getByRole('link', { name: 'Reports', exact: true }).click();

  const report = adminPage.getByRole('listitem').filter({ hasText: `Scam Job ${tag}` });
  await expect(report.getByText('They asked me to pay a registration fee.')).toBeVisible();
  answers.push('Asks teachers for money');
  await report.getByRole('button', { name: 'Take down vacancy' }).click();
  await expect(adminPage.getByText('Vacancy taken down.')).toBeVisible();
  answers.push('Vacancy taken down and poster suspended');
  await report.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(adminPage.getByText('Report resolved.')).toBeVisible();
  await expect(report).toHaveCount(0);

  await adminPage.getByRole('link', { name: 'Users', exact: true }).click();
  await adminPage.getByLabel('Email, phone or name').fill(directorEmail);
  await adminPage.getByRole('button', { name: 'Search' }).click();
  const row = adminPage.getByRole('listitem').filter({ hasText: directorEmail });
  answers.push('Posted a scam job');
  await row.getByRole('button', { name: 'Suspend' }).click();
  await expect(row.getByText('Suspended: Posted a scam job')).toBeVisible();

  await adminPage.getByRole('link', { name: 'Audit log' }).click();
  await expect(adminPage.getByText('user.suspend').first()).toBeVisible();
  await adminPage.close();

  // The job is gone and the poster cannot sign in.
  expect((await fetch(`http://localhost:4000/api/v1/vacancies/${vacancy.id}`)).status).toBe(404);
  const poster = await browser.newPage();
  await signIn(poster, directorEmail);
  await expect(poster.getByRole('alert').filter({ hasText: 'Your account is suspended' })).toBeVisible();
  await poster.close();
});
