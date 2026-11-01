import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { account, signIn } from './helpers';

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

test('a teacher writes a post, an admin approves it, everyone can read it, and signed-in readers like and comment', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const admin = seededAdmin();
  test.skip(!admin, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set in backend/.env');
  const stamp = `${info.project.name}-${Date.now()}`;
  const email = `pw-blog-t-${stamp}@e2e.edu-forum.test`;
  const asTeacher = await account(email, 'teacher');
  await asTeacher('/teachers/me/personal', 'PATCH', { fullName: 'Chioma Writer', gender: 'female', dob: '1990-02-02' });
  const title = `Five ways to revise for WAEC ${stamp}`;

  // Write and send from the account menu.
  await signIn(page, email);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('link', { name: 'My blog posts' }).click();
  await page.getByRole('link', { name: 'Write a post' }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Category').selectOption({ label: 'Exam prep' });
  await page.locator('#blog-body').click();
  await page.keyboard.insertText('Start early, use past questions, time yourself, mark your answers and rest well before the exam. '.repeat(4));
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page.getByText('Waiting for approval').first()).toBeVisible();

  // The admin approves it from the Blog queue.
  const adminPage = await browser.newPage();
  await adminPage.goto('/login');
  await adminPage.getByLabel('Email or phone number').fill(admin!.email);
  await adminPage.getByLabel('Password').fill(admin!.password);
  await adminPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(adminPage).toHaveURL(/\/admin$/);
  await adminPage.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Blog', exact: true }).click();
  const item = adminPage.getByRole('listitem').filter({ hasText: title });
  await item.getByRole('button', { name: 'Read post' }).click();
  await expect(item.getByText('Start early, use past questions').first()).toBeVisible();
  await item.getByRole('button', { name: 'Approve' }).click();
  await expect(item).toHaveCount(0);
  await adminPage.close();

  // A signed-out visitor finds it on /blog and reads it (Article markup, sign-in prompt).
  const visitor = await browser.newPage();
  await visitor.goto('/blog');
  await visitor.getByRole('link', { name: new RegExp(title) }).click();
  await expect(visitor.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(visitor.getByText('By Chioma Writer')).toBeVisible();
  const ld = await visitor.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.some((s) => s.includes('"@type":"Article"'))).toBe(true);
  await expect(visitor.getByText('to like and comment.')).toBeVisible();
  const path = new URL(visitor.url()).pathname;
  await visitor.close();

  // The signed-in teacher likes and comments on the public page.
  await page.goto(path);
  await page.getByRole('button', { name: 'Like post' }).click();
  await expect(page.getByRole('button', { name: 'Unlike post' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Write a comment').fill('Thanks for reading, ask me anything in the comments.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Thanks for reading, ask me anything in the comments.')).toBeVisible();
  await expect(page.getByText('1 comment', { exact: true })).toBeVisible();
});
