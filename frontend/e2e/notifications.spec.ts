import { expect, test } from '@playwright/test';
import { account, liveVacancy, publishedTeacher, signIn } from './helpers';

test('the bell updates live when a teacher applies; notifications open their page; email preferences save', async ({ page }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now()}`;
  const tag = `zn${Date.now().toString(36)}`;
  const directorEmail = `pw-notify-d-${stamp}@e2e.edu-forum.test`;
  const asDirector = await account(directorEmail, 'director');
  const vacancy = await liveVacancy(asDirector, `Physics Teacher ${tag}`);
  const asTeacher = await account(`pw-notify-t-${stamp}@e2e.edu-forum.test`, 'teacher');
  await publishedTeacher(asTeacher, `Bola ${tag}`);

  await signIn(page, directorEmail);
  await expect(page).toHaveURL(/\/hiring$/);
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();

  // No reload: the count arrives over /ws.
  await asTeacher(`/vacancies/${vacancy.id}/applications`, 'POST', { screeningAnswers: [] });
  const bell = page.getByRole('link', { name: 'Notifications, 1 unread' });
  await expect(bell).toBeVisible({ timeout: 30_000 });

  await bell.click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`New application: Physics Teacher ${tag}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/hiring/vacancies/${vacancy.id}/applicants`));
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();

  await page.goto('/hiring/notifications');
  const messages = page.getByLabel('New chat messages');
  await expect(messages).toBeChecked();
  await messages.uncheck();
  await page.getByRole('button', { name: 'Save email preferences' }).click();
  await expect(page.getByText('Email preferences saved.')).toBeVisible();
  expect((await asDirector('/notifications/preferences')).email.messages).toBe(false);
});
