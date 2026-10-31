import { expect, test, type Page } from '@playwright/test';

// Real stack: API dev server + Mailpit (docker compose).
const MAILPIT = 'http://localhost:8025/api/v1';
const API = 'http://localhost:4000/api/v1';
const DESCRIPTION =
  'We need a passionate Physics teacher for SS1 to SS3. You will plan lessons, prepare students for WAEC and NECO, and run practical sessions in the lab.';

async function verifyLink(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const search = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) {
      const text: string = (await fetch(`${MAILPIT}/message/${id}`).then((r) => r.json())).Text;
      return /(http:\/\/\S+\/verify-email\?token=[\w-]+)/.exec(text)![1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email for ${to}`);
}

async function signUpDirector(page: Page, email: string) {
  await page.goto('/register');
  await page.getByText('Director', { exact: true }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('lead2026x');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.goto(await verifyLink(email));
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/hiring$/);
}

async function fillVacancy(page: Page, { anonymous }: { anonymous: boolean }) {
  await page.getByLabel('Job title').fill('SS2 Physics Teacher');
  await page.getByRole('button', { name: 'Physics', exact: true }).click();
  await page.getByRole('button', { name: 'SSS', exact: true }).click();
  await page.getByLabel('Job type').selectOption('full_time');
  await page.getByLabel('From', { exact: true }).fill('150000');
  await page.getByLabel('To', { exact: true }).fill('220000');
  await page.locator('#description').click();
  await page.keyboard.type(DESCRIPTION);
  if (anonymous) await page.getByLabel('No, post anonymously').check();
  await page.getByLabel(anonymous ? 'School name (optional, kept private)' : 'School name', { exact: true }).fill('Greenfield Academy');
  await page.getByLabel('School type (optional)').selectOption('secondary');
  await page.getByLabel('State').selectOption({ label: 'Lagos' });
  await page.getByLabel('LGA / city').selectOption({ label: 'Ikeja' });
  await page.getByLabel('Address (optional)').fill('5 Allen Avenue, Ikeja');
}

test('a director posts, pauses, closes and duplicates vacancies; anonymous ones hide the school', async ({ page }, info) => {
  test.setTimeout(150_000);
  await signUpDirector(page, `pw-vacancy-${info.project.name}-${Date.now()}@e2e.edu-forum.test`);
  await expect(page.getByText('You have not posted a vacancy yet.')).toBeVisible();

  // Required fields are enforced in the form.
  await page.getByRole('link', { name: 'Post a vacancy' }).click();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Enter a job title')).toBeVisible();
  await expect(page.getByText('Write at least 100 characters')).toBeVisible();

  // 1. A listed vacancy, published straight away.
  await fillVacancy(page, { anonymous: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/hiring$/, { timeout: 15_000 });
  const listed = page.getByRole('listitem').filter({ hasText: 'Greenfield Academy · Ikeja, Lagos' });
  await expect(listed.getByText('Live')).toBeVisible();

  // 2. An anonymous vacancy, saved as a draft.
  await page.getByRole('link', { name: 'Post a vacancy' }).click();
  await fillVacancy(page, { anonymous: true });
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(page).toHaveURL(/\/hiring$/);
  // The poster still sees their own school name, marked anonymous.
  const anon = page.getByRole('listitem').filter({ hasText: 'Greenfield Academy (anonymous)' });
  await expect(anon.getByText('Draft')).toBeVisible();
  await anon.getByRole('button', { name: 'Publish' }).click();
  await expect(anon.getByText('Live')).toBeVisible();

  // The public API never shows the anonymous school's name or address.
  const mine = await page.evaluate(async (api) => {
    const token = await fetch(`${api}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json());
    return fetch(`${api}/vacancies/mine?status=published`, { headers: { Authorization: `Bearer ${token.accessToken}` } }).then((r) => r.json());
  }, API);
  const anonId = mine.data.find((v: { isAnonymous: boolean }) => v.isAnonymous).id;
  const publicView = await (await fetch(`${API}/vacancies/${anonId}`)).json();
  expect(publicView).toMatchObject({ schoolLabel: 'Confidential school', schoolName: null, schoolType: 'secondary', location: { addressLine: null } });
  expect(JSON.stringify(publicView)).not.toContain('Greenfield');

  // 3. Pause, resume, close; duplicate the closed one as a new draft, then delete that draft.
  await listed.getByRole('button', { name: 'Pause' }).click();
  await expect(listed.getByText('Paused')).toBeVisible();
  await listed.getByRole('button', { name: 'Resume' }).click();
  await expect(listed.getByText('Live')).toBeVisible();
  await listed.getByRole('button', { name: 'Close' }).click();
  await expect(listed.getByText('Closed')).toBeVisible();
  await listed.getByRole('button', { name: 'Duplicate' }).click();
  const copy = page.getByRole('listitem').filter({ hasText: 'Greenfield Academy · Ikeja, Lagos' }).filter({ hasText: 'Draft' });
  await expect(copy).toHaveCount(1);
  await copy.getByRole('button', { name: 'Delete' }).click();
  await expect(copy).toHaveCount(0);

  // Editing keeps the vacancy and its status.
  await anon.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit vacancy' })).toBeVisible();
  await expect(page.getByLabel('Job title')).toHaveValue('SS2 Physics Teacher');
  await page.getByLabel('Job title').fill('SS3 Physics Teacher');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/hiring$/);
  await expect(page.getByText('SS3 Physics Teacher')).toBeVisible();
});
