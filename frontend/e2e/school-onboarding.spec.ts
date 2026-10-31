import { expect, test, type Page } from '@playwright/test';

// Real stack: API dev server + Mailpit (docker compose).
const MAILPIT = 'http://localhost:8025/api/v1';

async function emailLink(to: string, pattern: RegExp): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const search = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) {
      const text: string = (await fetch(`${MAILPIT}/message/${id}`).then((r) => r.json())).Text;
      const match = pattern.exec(text);
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No matching email for ${to}`);
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
}

test('school owner sets up the school and invites a recruiter who joins from the email', async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const stamp = `${info.project.name}-${Date.now()}`;
  const ownerEmail = `pw-owner-${stamp}@e2e.edu-forum.test`;
  const recruiterEmail = `pw-recruiter-${stamp}@e2e.edu-forum.test`;

  // Sign up as a school and verify the email.
  await page.goto('/register');
  await page.getByText('Hiring teachers').click();
  await page.getByLabel('Email address').fill(ownerEmail);
  await page.getByLabel('Password').fill('school2026');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.goto(await emailLink(ownerEmail, /(http:\/\/\S+\/verify-email\?token=[\w-]+)/));
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/school$/);

  await page.getByRole('link', { name: 'Start school setup' }).click();

  // 1. Details
  await expect(page.getByRole('heading', { name: 'School details' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.getByLabel('School name').fill('Greenfield Academy');
  await page.getByLabel('Type').selectOption('secondary');
  await page.getByLabel('Ownership').selectOption('private');
  await page.getByRole('button', { name: 'Nigerian' }).click();
  await page.getByRole('button', { name: 'British' }).click();
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'Create school and continue' }).click();

  // 2. Location (full address required)
  await expect(page.getByRole('heading', { name: 'Location' })).toBeVisible();
  await page.getByLabel('State').selectOption({ label: 'Lagos' });
  await page.getByLabel('LGA / city').selectOption({ label: 'Eti-Osa' });
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Enter the school’s full address')).toBeVisible();
  await page.getByLabel('Full address').fill('12 Admiralty Way, Lekki Phase 1');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // 3. Contact person, pre-filled with the owner's email
  await expect(page.getByRole('heading', { name: 'Contact person' })).toBeVisible();
  await expect(page.getByLabel('Email address')).toHaveValue(ownerEmail);
  await page.getByLabel('Full name').fill('Mrs Bisi Adeyemi');
  await page.getByLabel('Title').selectOption('principal');
  await page.getByLabel('Phone number').fill('0803 123 4567');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // 4. Identification (submission arrives with verification)
  await expect(page.getByRole('heading', { name: 'Identification' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 5. Team: invite a recruiter
  await expect(page.getByRole('heading', { name: 'Invite your team' })).toBeVisible();
  await page.getByLabel('Email address').fill(recruiterEmail);
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText(`Invite sent to ${recruiterEmail}.`)).toBeVisible();
  await expect(page.getByText('Pending invites')).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page).toHaveURL(/\/school$/);
  await expect(page.getByRole('heading', { name: 'Greenfield Academy' })).toBeVisible();

  // The recruiter opens the email link in their own browser and signs up from it.
  const link = await emailLink(recruiterEmail, /(http:\/\/\S+\/join-school\?token=[\w-]+)/);
  const recruiter = await browser.newPage();
  await recruiter.goto(link);
  await expect(recruiter.getByRole('heading', { name: 'Join Greenfield Academy' })).toBeVisible();
  await recruiter.getByRole('link', { name: 'Create your account to accept' }).click();
  await expect(recruiter.getByLabel('Email address')).toHaveValue(recruiterEmail);
  await recruiter.getByLabel('Password').fill('recruit2026');
  await recruiter.getByRole('checkbox').check();
  await recruiter.getByRole('button', { name: 'Create account' }).click();
  await recruiter.getByRole('button', { name: 'Join Greenfield Academy' }).click();
  await expect(recruiter).toHaveURL(/\/school$/);
  await expect(recruiter.getByRole('heading', { name: 'Greenfield Academy' })).toBeVisible();
  await expect(recruiter.getByText('See who recruits for your school')).toBeVisible();
  await recruiter.close();

  // The owner now sees both on the team page.
  await page.getByRole('link', { name: /^Team/ }).click();
  await expect(page.getByText('Pending invites')).toHaveCount(0);
  await expect(page.getByText(recruiterEmail, { exact: true })).toBeVisible();
});
