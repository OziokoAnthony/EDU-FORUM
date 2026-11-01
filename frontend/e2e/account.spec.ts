import { expect, test } from '@playwright/test';
import { account, liveVacancy, publishedTeacher, signIn } from './helpers';

test('dashboards show CV views and the overview; a teacher downloads their data, deletes the account and signs back in to cancel', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now()}`;
  const directorEmail = `pw-acct-d-${stamp}@e2e.edu-forum.test`;
  const teacherEmail = `pw-acct-t-${stamp}@e2e.edu-forum.test`;
  const asDirector = await account(directorEmail, 'director');
  await liveVacancy(asDirector, `Maths Teacher ${Date.now().toString(36)}`, { subjects: ['physics'] });
  const asTeacher = await account(teacherEmail, 'teacher');
  await publishedTeacher(asTeacher, 'Halima Bello');
  const profile = await asTeacher('/teachers/me');
  await asDirector(`/teachers/${profile.id}`);
  await asDirector(`/teachers/${profile.id}/cv`);

  // Teacher dashboard: "1 principal or director viewed your CV this week".
  await signIn(page, teacherEmail);
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.getByText('principal or director viewed your CV this week')).toBeVisible();
  await page.getByRole('link', { name: /viewed your CV this week/ }).click();
  await expect(page.getByRole('heading', { name: 'Who viewed my profile' })).toBeVisible();
  await expect(page.getByText('A director opened your CV')).toBeVisible();
  await expect(page.getByText('A director viewed your profile')).toBeVisible();

  // Download my data.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('link', { name: 'Account' }).click();
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  expect((await download).suggestedFilename()).toMatch(/^edu-forum-my-data-\d{4}-\d{2}-\d{2}\.json$/);

  // Delete: needs the confirm word, then signs out with the date shown.
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('Type DELETE to confirm.')).toBeVisible();
  await page.getByLabel('Type DELETE to confirm').fill('delete');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/login\?deleted=/);
  await expect(page.getByText(/Your account is hidden and will be deleted on/)).toBeVisible();

  // Signing in again cancels the deletion.
  await signIn(page, teacherEmail);
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.getByText('Signing in cancelled your account deletion')).toBeVisible();

  // Principal/director overview on their home page.
  const director = await browser.newPage();
  await signIn(director, directorEmail);
  await expect(director).toHaveURL(/\/hiring$/);
  await expect(director.getByText('Live vacancies')).toBeVisible();
  await director.close();
});
