import { expect, test } from '@playwright/test';
import { account, liveVacancy, publishedTeacher, signIn } from './helpers';

test('director invites from a profile; teacher accepts with answers; interview scheduled and confirmed', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now()}`;
  const tag = `zi${Date.now().toString(36)}`;
  const directorEmail = `pw-inv-d-${stamp}@e2e.edu-forum.test`;
  const teacherEmail = `pw-inv-t-${stamp}@e2e.edu-forum.test`;
  const asDirector = await account(directorEmail, 'director');
  await liveVacancy(asDirector, `Physics Teacher ${tag}`, { screeningQuestions: [{ question: 'Are you TRCN registered?', type: 'yes_no' }] });
  const asTeacher = await account(teacherEmail, 'teacher');
  await publishedTeacher(asTeacher, `Emeka ${tag}`);
  const profile = await asTeacher('/teachers/me');

  // Director invites from the teacher's profile.
  await signIn(page, directorEmail);
  await expect(page).toHaveURL(/\/hiring$/);
  await page.goto(`/hiring/teachers/${profile.id}`);
  await page.getByRole('button', { name: `Invite Emeka ${tag} to apply` }).click();
  await page.getByLabel('Vacancy').selectOption({ label: `Physics Teacher ${tag}` });
  await page.getByLabel('Message (optional)').fill('We would love to meet you.');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(`Invitation sent. Emeka ${tag} has been notified.`)).toBeVisible();

  // Teacher accepts, answering the screening question.
  const teacher = await browser.newPage();
  await signIn(teacher, teacherEmail);
  await expect(teacher).toHaveURL(/\/teacher$/);
  await teacher.getByRole('link', { name: /Invitations/ }).first().click();
  await expect(teacher.getByText('“We would love to meet you.”')).toBeVisible();
  await teacher.getByRole('button', { name: 'Accept and apply' }).click();
  await teacher.getByRole('button', { name: 'Accept and send application' }).click();
  await expect(teacher.getByText('Answer this question')).toBeVisible();
  await teacher.getByLabel('Yes').check();
  await teacher.getByRole('button', { name: 'Accept and send application' }).click();
  await expect(teacher.getByRole('link', { name: 'See my application' })).toBeVisible({ timeout: 30_000 });

  // Director sees the acceptance and books an interview from the application.
  await page.goto('/hiring/invitations');
  await expect(page.getByText('Accepted')).toBeVisible();
  await page.getByRole('link', { name: 'See application' }).click();
  await page.getByRole('button', { name: 'Schedule an interview' }).click();
  const when = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.getByLabel('Date and time').fill(local);
  await page.getByLabel('How').selectOption('video');
  await page.getByLabel('Video link (Google Meet, Zoom…)').fill('meet');
  await page.getByRole('button', { name: 'Send interview invitation' }).click();
  await expect(page.getByText('Paste the full video link, starting with https://')).toBeVisible();
  await page.getByLabel('Video link (Google Meet, Zoom…)').fill('https://meet.google.com/abc-defg-hij');
  await page.getByRole('button', { name: 'Send interview invitation' }).click();
  await expect(page.getByText('Waiting for teacher')).toBeVisible();

  // Teacher confirms.
  await teacher.goto('/teacher/interviews');
  await expect(teacher.getByRole('link', { name: 'https://meet.google.com/abc-defg-hij' })).toBeVisible();
  await teacher.getByRole('button', { name: 'Confirm' }).click();
  await expect(teacher.getByText('Confirmed', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
});
