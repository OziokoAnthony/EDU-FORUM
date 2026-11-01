import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

test('without a publisher ID no ad script or ad space appears, and ads.txt says so', async ({ page, request }) => {
  const txt = await request.get('/ads.txt');
  expect(txt.status()).toBe(200);
  expect(await txt.text()).toContain('AdSense is not set up yet');
  for (const path of ['/', '/jobs', '/blog']) {
    await page.goto(path);
    await expect(page.locator('script[src*="adsbygoogle"], script[src*="fundingchoicesmessages"]')).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Advertisement' })).toHaveCount(0);
  }
});

test('admins see every ad space, off at first, and cannot switch one on without its slot ID', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough: it changes shared settings');
  const admin = seededAdmin();
  test.skip(!admin, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set in backend/.env');
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(admin!.email);
  await page.getByLabel('Password').fill(admin!.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Ads', exact: true }).click();
  await expect(page.getByText('No AdSense publisher ID yet')).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: 'Blog posts: inside the article (up to 3)' });
  await expect(row.getByText('Off', { exact: true })).toBeVisible();
  await row.getByLabel('Show ads here').check();
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByText('Add the AdSense slot ID before switching this space on')).toBeVisible();
  // Prepare the slot ID without switching it on.
  await row.getByLabel('Show ads here').uncheck();
  await row.getByLabel('AdSense slot ID').fill('1234567890');
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByText('Saved: this space is off.')).toBeVisible();
  // Leave the local settings as they were.
  await row.getByLabel('AdSense slot ID').fill('');
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByRole('button', { name: 'Save' })).toBeDisabled();
});
