import { expect, test } from '@playwright/test';
import { account, signIn } from './helpers';

test('the app can be installed: manifest with icons, a fresh service worker, and an offline page when there is no network', async ({ page, request, context }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ short_name: 'eduforum', display: 'standalone', start_url: '/?source=app' });
  expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`)).toEqual(['192x192:any', '512x512:any', '512x512:maskable']);
  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['cache-control']).toContain('no-cache');
  expect((await request.get('/brand/icon-maskable-512.png')).status()).toBe(200);

  // The service worker takes control, saves the offline page, then serves it without a network.
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.goto('/about');
  await context.setOffline(true);
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1, name: 'About us' })).toBeVisible();
  await page.goto('/jobs/subject/never-visited-page');
  await expect(page.getByRole('heading', { level: 1, name: 'You are offline' })).toBeVisible();
  await context.setOffline(false);
});

test('signed-in users find "Alerts on this device" on their notifications page', async ({ page, context }, info) => {
  // Headless browsers always report notifications as blocked; a real visitor starts at "not asked yet".
  await context.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'default' }));
  const email = `pw-push-${info.project.name}-${Date.now()}@e2e.edu-forum.test`;
  await account(email, 'teacher');
  await signIn(page, email);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto('/teacher/notifications');
  await expect(page.getByRole('heading', { name: 'Alerts on this device' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn on alerts' })).toBeVisible();
  // Text alerts start with adding and confirming a phone number.
  await expect(page.getByRole('heading', { name: 'Text me (SMS or WhatsApp)' })).toBeVisible();
  await expect(page.getByText('Add your phone number to get text alerts.')).toBeVisible();
});
