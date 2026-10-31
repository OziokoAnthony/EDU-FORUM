import { expect, test } from '@playwright/test';
import { account, CV_PDF, publishedTeacher, signIn } from './helpers';

test('director messages a teacher; replies, "Seen", a PDF and a deleted message arrive live; teacher blocks', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now()}`;
  const tag = `zm${Date.now().toString(36)}`;
  const directorEmail = `pw-chat-d-${stamp}@e2e.edu-forum.test`;
  const teacherEmail = `pw-chat-t-${stamp}@e2e.edu-forum.test`;
  await account(directorEmail, 'director');
  const asTeacher = await account(teacherEmail, 'teacher');
  await publishedTeacher(asTeacher, `Funke ${tag}`);
  const profile = await asTeacher('/teachers/me');

  await signIn(page, directorEmail);
  await expect(page).toHaveURL(/\/hiring$/);
  await page.goto(`/hiring/teachers/${profile.id}`);
  await page.getByRole('button', { name: `Message Funke ${tag}` }).click();
  await expect(page).toHaveURL(/\/hiring\/messages\/[\w-]+$/);
  await page.getByLabel('Message', { exact: true }).fill('Hello Funke, are you available for an interview?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Hello Funke, are you available for an interview?')).toBeVisible();

  const teacher = await browser.newPage();
  await signIn(teacher, teacherEmail);
  await expect(teacher).toHaveURL(/\/teacher$/);
  await teacher.getByRole('link', { name: /^Messages/ }).click();
  await expect(teacher.getByLabel('1 unread')).toBeVisible();
  await teacher.getByRole('link', { name: /Director/ }).click();
  await expect(teacher.getByText('Hello Funke, are you available for an interview?')).toBeVisible();

  // Reading shows "Seen" to the director, live.
  await expect(page.getByText('✓✓ Seen')).toBeVisible({ timeout: 15_000 });

  // The reply arrives without a reload.
  await teacher.getByLabel('Message', { exact: true }).fill('Yes, any weekday works.');
  await teacher.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Yes, any weekday works.')).toBeVisible({ timeout: 15_000 });

  // A PDF: virus-checked, then openable on both sides.
  await teacher.getByLabel('Attach a file').setInputFiles({ name: 'certificates.pdf', mimeType: 'application/pdf', buffer: CV_PDF });
  await teacher.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('button', { name: /📎 certificates\.pdf/ })).toBeVisible({ timeout: 60_000 });

  // The director deletes their first message; the teacher sees the placeholder.
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete' }).first().click();
  await expect(teacher.getByText('Message deleted')).toBeVisible({ timeout: 15_000 });

  // The teacher blocks; the director can no longer write.
  teacher.once('dialog', (d) => void d.accept());
  await teacher.getByRole('button', { name: 'Block' }).click();
  await expect(teacher.getByText('You blocked this chat. Unblock to send messages.')).toBeVisible();
  await expect(page.getByText('You cannot send messages in this chat.')).toBeVisible({ timeout: 15_000 });
});
