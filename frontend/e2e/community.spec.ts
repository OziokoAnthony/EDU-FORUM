import { expect, test } from '@playwright/test';
import { account, liveVacancy, signIn } from './helpers';

test('a director shares a job in the community; a teacher sees it live, likes it and comments; the count updates for the director', async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const stamp = `${info.project.name}-${Date.now()}`;
  const directorEmail = `pw-comm-d-${stamp}@e2e.edu-forum.test`;
  const teacherEmail = `pw-comm-t-${stamp}@e2e.edu-forum.test`;
  const asDirector = await account(directorEmail, 'director');
  const title = `Chemistry Teacher ${Date.now().toString(36)}`;
  const vacancy = await liveVacancy(asDirector, title);
  const asTeacher = await account(teacherEmail, 'teacher');
  await asTeacher('/teachers/me/personal', 'PATCH', { fullName: 'Ngozi Eze', gender: 'female', dob: '1993-03-02' });
  const text = `We are hiring for next term ${stamp}`;

  // The teacher has the feed open before the post goes up.
  await signIn(page, teacherEmail);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto('/teacher/community');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  // No sideways scrolling at 360 px (the topic chips scroll inside their own row).
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  // The director shares the job from ?share=, after the phone-number warning.
  const director = await browser.newPage();
  await signIn(director, directorEmail);
  await expect(director).toHaveURL(/\/hiring$/);
  await director.goto(`/hiring/community?share=${vacancy.id}`);
  // ?share= opens the "Create post" pop-up with the job attached.
  await expect(director.getByRole('dialog', { name: 'Create post' })).toBeVisible();
  await expect(director.getByText(new RegExp(`Sharing job: ${title}`))).toBeVisible();
  const box = director.getByPlaceholder("What's on your mind?");
  await box.fill('Call me on 0803 123 4567');
  await expect(director.getByText('Please do not share phone numbers in the community. Use chat instead.')).toBeVisible();
  await expect(director.getByRole('button', { name: 'Post', exact: true })).toBeDisabled();
  await box.fill(text);
  await director.getByLabel('Topic', { exact: true }).selectOption({ label: 'Job tips' });
  await director.getByRole('button', { name: 'Post', exact: true }).click();
  const mine = director.getByRole('article').filter({ hasText: text });
  await expect(mine).toBeVisible();
  await expect(director.getByRole('dialog')).toHaveCount(0);
  await expect(mine.getByText('Director').first()).toBeVisible();
  await expect(mine.getByRole('link', { name: new RegExp(title) })).toBeVisible();

  // Live on the teacher's feed: "N new posts", then like and comment.
  await page.getByRole('button', { name: /new posts?/ }).click();
  const post = page.getByRole('article').filter({ hasText: text });
  await expect(post).toBeVisible();
  await post.getByRole('button', { name: 'Like post' }).click();
  await expect(post.getByRole('button', { name: 'Unlike post' })).toHaveAttribute('aria-pressed', 'true');
  await post.getByRole('button', { name: 'Comment', exact: true }).click();
  await post.getByLabel('Write a comment').fill('Is the role open to NCE holders?');
  await post.getByRole('button', { name: 'Send' }).click();
  await expect(post.getByText('Is the role open to NCE holders?')).toBeVisible();
  await expect(post.getByText('Ngozi Eze').first()).toBeVisible();

  // The director's open feed updates in place.
  await expect(mine.getByRole('button', { name: '1 comment' })).toBeVisible();
  await expect(mine.getByLabel('1 like')).toBeVisible();

  // The teacher shares the post: the share shows the original inside, the count goes up live.
  await post.getByRole('link', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share post' });
  await expect(dialog.getByText(text)).toBeVisible();
  await dialog.getByPlaceholder('Say something about this…').fill(`Great opportunity ${stamp}`);
  await dialog.getByRole('button', { name: 'Share now' }).click();
  const share = page.getByRole('article').filter({ hasText: `Great opportunity ${stamp}` });
  await expect(share.getByText('shared a post')).toBeVisible();
  await expect(share.getByText(text)).toBeVisible();
  await expect(mine.getByText('1 share')).toBeVisible();
  await director.close();
});
