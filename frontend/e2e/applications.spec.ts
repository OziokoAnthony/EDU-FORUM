import { expect, test } from '@playwright/test';
import { account, latestEmail, liveVacancy, publishedTeacher, signIn } from './helpers';

test('teacher applies; director shortlists with a message and exports CSV; teacher is emailed', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now()}`;
  const tag = `za${Date.now().toString(36)}`;
  const teacherEmail = `pw-apply-t-${stamp}@e2e.edu-forum.test`;
  const directorEmail = `pw-apply-d-${stamp}@e2e.edu-forum.test`;

  const asTeacher = await account(teacherEmail, 'teacher');
  await publishedTeacher(asTeacher, `Ada ${tag}`);
  const asDirector = await account(directorEmail, 'director');
  const vacancy = await liveVacancy(asDirector, `Physics Teacher ${tag}`, {
    screeningQuestions: [
      { question: 'Are you TRCN registered?', type: 'yes_no' },
      { question: 'Why this school?', type: 'text' },
    ],
  });

  // Teacher applies from the job page.
  await signIn(page, teacherEmail);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto(`/teacher/jobs/${vacancy.id}`);
  await expect(page.getByRole('heading', { name: `Physics Teacher ${tag}` })).toBeVisible();
  await page.getByRole('button', { name: 'Send application' }).click();
  await expect(page.getByText('Answer this question').first()).toBeVisible();
  await page.getByLabel('Yes').check();
  await page.getByLabel('Your answer').fill('I love hands-on physics teaching.');
  await page.getByLabel('Cover note (optional)').fill('I would love to join your team.');
  await page.getByRole('button', { name: 'Send application' }).click();
  // Applying copies the CV in Backblaze B2 (the snapshot); that round trip varies.
  await expect(page.getByText(/You applied on/)).toBeVisible({ timeout: 30_000 });
  expect((await latestEmail(directorEmail, 'New application')).Subject).toBe(`New application: Physics Teacher ${tag}`);

  // Director reviews and shortlists.
  const director = await browser.newPage();
  await signIn(director, directorEmail);
  await expect(director).toHaveURL(/\/hiring$/);
  await director.getByRole('link', { name: 'Applicants (1)' }).click();
  await expect(director.getByRole('heading', { name: 'Applicants', exact: true })).toBeVisible();
  await director.getByRole('link', { name: new RegExp(`Ada ${tag}`) }).click();
  await expect(director.getByRole('heading', { name: `Ada ${tag}` })).toBeVisible();
  await expect(director.getByText('I would love to join your team.')).toBeVisible();
  await expect(director.getByText('Secret Close')).toHaveCount(0);
  await director.getByRole('button', { name: '4 stars' }).click();
  await director.getByLabel('New status').selectOption('shortlisted');
  await director.getByLabel('Message to the teacher (optional)').fill('Please come for a demo lesson on Monday.');
  await director.getByRole('button', { name: 'Update status' }).click();
  await expect(director.getByText('Status updated. The teacher has been emailed.')).toBeVisible();
  await director.getByLabel('Add a note').fill('Strong candidate');
  await director.getByRole('button', { name: 'Save note' }).click();
  await expect(director.getByText('Strong candidate')).toBeVisible();

  // CSV export downloads a file.
  await director.getByRole('link', { name: /All applicants for/ }).click();
  const [download] = await Promise.all([director.waitForEvent('download'), director.getByRole('button', { name: 'Export CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^applicants-physics-teacher-.+\.csv$/);
  await director.close();

  // Teacher gets the email and sees the new status and message.
  const mail = await latestEmail(teacherEmail, 'Shortlisted');
  expect(mail.Text).toContain('Please come for a demo lesson on Monday.');
  await page.goto('/teacher/applications');
  const card = page.getByRole('listitem').filter({ hasText: `Physics Teacher ${tag}` });
  await expect(card.getByText('Shortlisted', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Show history' }).click();
  await expect(card.getByText('“Please come for a demo lesson on Monday.”')).toBeVisible();
  await expect(page.getByText('Strong candidate')).toHaveCount(0);
});
