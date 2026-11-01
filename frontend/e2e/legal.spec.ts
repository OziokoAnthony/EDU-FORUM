import { expect, test } from '@playwright/test';

const PAGES = [
  ['/about', 'About us'],
  ['/safety', 'Safety tips'],
  ['/privacy', 'Privacy policy'],
  ['/terms', 'Terms of use'],
  ['/contact', 'Contact us'],
] as const;

test('about, safety, privacy, terms and contact pages are indexable, linked from the footer and listed in the sitemap', async ({ page, request }) => {
  for (const [path, h1] of PAGES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${path}$`));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^index/);
    await expect(page.locator('footer').getByRole('link', { name: h1 === 'Contact us' ? 'Contact' : h1, exact: true })).toBeVisible();
  }
  await page.goto('/privacy');
  await expect(page.getByText('Google AdSense')).toBeVisible();
  const sitemap = await (await request.get('/sitemaps/pages.xml')).text();
  for (const [path] of PAGES) expect(sitemap).toContain(path);
  expect(await (await request.get('/sitemap.xml')).text()).toContain('/sitemaps/pages.xml');
});

test('the contact form checks the fields, refuses links and thanks the sender', async ({ page }, info) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Enter your name')).toBeVisible();
  await page.getByLabel('Your name').fill('Tunde Visitor');
  await page.getByLabel('Email address').fill(`pw-contact-${info.project.name}-${Date.now()}@e2e.edu-forum.test`);
  await page.getByLabel('Topic').selectOption({ label: 'Posting or applying for jobs' });
  await page.getByLabel('Message').fill('See www.example.com for my question about posting jobs');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Please remove links from your message')).toBeVisible();
  await page.getByLabel('Message').fill('How long does a vacancy stay live after I publish it?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Thank you. Your message has reached our team')).toBeVisible();
});
