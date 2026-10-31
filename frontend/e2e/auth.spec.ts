import { expect, test } from '@playwright/test';

// Uses the real API (backend dev server) and reads the email from Mailpit (docker compose).
const MAILPIT = 'http://localhost:8025/api/v1';

async function latestEmailText(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const search = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) return (await fetch(`${MAILPIT}/message/${id}`).then((r) => r.json())).Text;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email for ${to}`);
}

test('auth pages are noindex', async ({ page }) => {
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('h1')).toHaveCount(1);
  }
});

test('teacher signs up, verifies email from the inbox, and reaches the dashboard', async ({ page }, info) => {
  const email = `pw-${info.project.name}-${Date.now()}@e2e.edu-forum.test`;

  await page.goto('/register');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('teach2026');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const link = /(http:\/\/\S+\/verify-email\?token=[\w-]+)/.exec(await latestEmailText(email))![1];
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);

  // Session survives a reload (restored from the httpOnly refresh cookie).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/teacher');
  await expect(page).toHaveURL(/\/login$/);
});

test('shows field errors from the shared schema and a generic sign-in error', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Email address').fill('not-an-email');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
  await expect(page.getByText('You must accept the terms and privacy policy')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('nobody@e2e.edu-forum.test');
  await page.getByLabel('Password').fill('wrong1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Incorrect email/phone or password' })).toBeVisible();
});

test('a director signs up, verifies and lands in the hiring area', async ({ page }, info) => {
  const email = `pw-director-${info.project.name}-${Date.now()}@e2e.edu-forum.test`;
  await page.goto('/register');
  await page.locator('fieldset').getByText('Director', { exact: true }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('lead2026x');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/verify-email$/);

  const link = /(http:\/\/\S+\/verify-email\?token=[\w-]+)/.exec(await latestEmailText(email))![1];
  await page.goto(link);
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/hiring$/);
  await expect(page.getByRole('heading', { name: 'Your vacancies' })).toBeVisible();
  // A director cannot open the teacher area.
  await page.goto('/teacher');
  await expect(page).toHaveURL(/\/hiring$/);
});
