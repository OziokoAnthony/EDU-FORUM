import { expect, test, type Page } from '@playwright/test';

// Real stack: API dev server (BullMQ worker, Backblaze B2, ClamAV) + Mailpit.
const MAILPIT = 'http://localhost:8025/api/v1';

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

async function signUpVerifiedTeacher(page: Page, email: string) {
  await page.goto('/register');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('teach2026');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.goto(await verifyLink(email));
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/teacher$/);
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
}

const CV_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

test('teacher completes the onboarding wizard, uploads a CV and publishes', async ({ page }, info) => {
  test.setTimeout(180_000);
  await signUpVerifiedTeacher(page, `pw-onboard-${info.project.name}-${Date.now()}@e2e.edu-forum.test`);

  await expect(page.getByText('0%')).toBeVisible();
  await page.getByRole('link', { name: 'Continue profile setup' }).click();

  // 1. Personal details
  await expect(page.getByRole('heading', { name: 'Personal details' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Enter your full name')).toBeVisible();
  await page.getByLabel('Full name').fill('Ada Okafor');
  await page.getByLabel('Gender').selectOption('female');
  await page.getByLabel('Date of birth').fill('1994-05-12');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // 2. Location
  await expect(page.getByRole('heading', { name: 'Location' })).toBeVisible();
  await page.getByLabel('State').selectOption({ label: 'Lagos' });
  await page.getByLabel('LGA / city').selectOption({ label: 'Ikeja' });
  await page.getByLabel('Street address (optional)').fill('12 Private Close');
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // 3. Qualifications
  await expect(page.getByRole('heading', { name: 'Qualifications' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByLabel('Qualification', { exact: true }).selectOption({ label: 'B.Ed.' });
  await page.getByLabel('Course').fill('Mathematics Education');
  await page.getByLabel('Institution').fill('University of Lagos');
  await page.getByLabel('Year obtained').fill('2017');
  await page.getByRole('button', { name: 'Save qualification' }).click();
  await expect(page.getByText('B.Ed. Mathematics Education')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 4. Certifications (optional)
  await expect(page.getByRole('heading', { name: 'Teaching certifications' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip: I have none' }).click();

  // 5. Work experience
  await expect(page.getByRole('heading', { name: 'Work experience' })).toBeVisible();
  await page.getByLabel('School name').fill('Kings College');
  await page.getByLabel('Role').fill('Mathematics teacher');
  await page.getByLabel('Start date').fill('2018-01-08');
  await page.getByLabel('I work here now').check();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('Mathematics teacher, Kings College')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 6. Teaching preferences
  await expect(page.getByRole('heading', { name: 'Teaching preferences' })).toBeVisible();
  await page.getByRole('button', { name: 'Mathematics', exact: true }).click();
  await page.getByRole('button', { name: 'SSS', exact: true }).click();
  await page.getByRole('button', { name: 'Full-time' }).click();
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'Save and continue' }).click();

  // 7. CV: signed upload straight to B2, then ClamAV in the background worker.
  await expect(page.getByRole('heading', { name: 'CV upload' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'ada-okafor-cv.pdf', mimeType: 'application/pdf', buffer: CV_PDF });
  await expect(page.getByText('Active CV')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('ada-okafor-cv.pdf')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 8. Identification (submission arrives with identity verification)
  await expect(page.getByRole('heading', { name: 'Identification' })).toBeVisible();
  await page.getByRole('button', { name: 'Review and publish' }).click();

  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.getByText('85%')).toBeVisible();
  await page.getByRole('button', { name: 'Publish my profile' }).click();
  await expect(page.getByText('Your profile is live. Schools can now find you.')).toBeVisible();
  await noHorizontalScroll(page);
});

test('wrong file type is refused before upload', async ({ page }, info) => {
  await signUpVerifiedTeacher(page, `pw-cvtype-${info.project.name}-${Date.now()}@e2e.edu-forum.test`);
  await page.goto('/teacher/cv');
  await page.locator('input[type=file]').setInputFiles({ name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
  await expect(page.getByRole('alert').filter({ hasText: 'File must be PDF, DOC or DOCX' })).toBeVisible();
});
