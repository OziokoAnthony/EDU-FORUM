import { expect, test } from '@playwright/test';
import { account, liveVacancy, publishedTeacher, signIn } from './helpers';

test('teacher saves a job and a search; the saved search reopens with its filters; director saves a teacher', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now()}`;
  const tag = `zs${Date.now().toString(36)}`;
  const directorEmail = `pw-saved-d-${stamp}@e2e.edu-forum.test`;
  const teacherEmail = `pw-saved-t-${stamp}@e2e.edu-forum.test`;
  const asDirector = await account(directorEmail, 'director');
  const vacancy = await liveVacancy(asDirector, `Physics Teacher ${tag}`);
  const asTeacher = await account(teacherEmail, 'teacher');
  await publishedTeacher(asTeacher, `Bisi ${tag}`);
  const profile = await asTeacher('/teachers/me');

  await signIn(page, teacherEmail);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto(`/teacher/jobs/${vacancy.id}`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

  // Search, then save it with weekly alerts.
  await page.goto('/teacher/jobs');
  await page.getByRole('tab', { name: 'Search all jobs' }).click();
  await page.getByLabel('Keyword').fill(tag);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('1 job found')).toBeVisible();
  await page.getByRole('button', { name: /Save this search/ }).click();
  await page.getByLabel('Name this search').fill(`Physics ${tag}`);
  await page.getByLabel('Alert me').selectOption('weekly');
  await page.getByRole('button', { name: 'Save search' }).click();
  await page.getByRole('link', { name: 'Manage saved searches' }).click();

  await expect(page.getByRole('heading', { name: 'Saved jobs' })).toBeVisible();
  await expect(page.getByRole('link', { name: `Physics Teacher ${tag}` })).toBeVisible();
  await expect(page.getByLabel('Alerts')).toHaveValue('weekly');
  await page.getByRole('link', { name: `Physics ${tag}` }).click();
  await expect(page.getByLabel('Keyword')).toHaveValue(tag);
  await expect(page.getByText('1 job found')).toBeVisible();

  // Director saves the teacher.
  const director = await browser.newPage();
  await signIn(director, directorEmail);
  await expect(director).toHaveURL(/\/hiring$/);
  await director.goto(`/hiring/teachers/${profile.id}`);
  await director.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(director.getByRole('button', { name: 'Saved' })).toBeVisible();
  await director.goto('/hiring/saved');
  await expect(director.getByRole('heading', { name: 'Saved teachers' })).toBeVisible();
  await expect(director.getByText(`Bisi ${tag}`)).toBeVisible();
});
