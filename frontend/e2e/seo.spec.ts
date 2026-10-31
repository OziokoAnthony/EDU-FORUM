import { expect, test, type Page } from '@playwright/test';
import { account, liveVacancy } from './helpers';

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((b) => JSON.parse(b));
}

test('public job pages, structured data, landing page, robots and sitemaps', async ({ page }, info) => {
  test.setTimeout(150_000);
  const tag = `zs${Date.now().toString(36)}`;
  const director = await account(`pw-seo-${info.project.name}-${Date.now()}@e2e.edu-forum.test`, 'director');
  const listed = await liveVacancy(director, `Physics Teacher ${tag}`);
  const anon = await liveVacancy(director, `Chemistry Teacher ${tag}`, { locationVisibility: 'anonymous', schoolName: 'Hidden College', subjects: ['chemistry'] });
  const listedPath = `/jobs/${listed.slug}-${listed.shortId}`;

  // Listed job: one h1, canonical, indexable, JobPosting + BreadcrumbList, Apply link, internal links.
  await page.goto(listedPath);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Physics Teacher ${tag}`);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${listedPath}$`));
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index, follow/);
  expect(await page.title()).toContain(`Physics Teacher ${tag} job in Ikeja, Lagos`);
  const ld = await jsonLd(page);
  const posting = ld.find((d) => d['@type'] === 'JobPosting') as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(posting).toMatchObject({ hiringOrganization: { name: 'Greenfield Academy' }, baseSalary: { currency: 'NGN' }, jobLocation: { address: { addressCountry: 'NG' } } });
  expect(ld.some((d) => d['@type'] === 'BreadcrumbList')).toBe(true);
  await expect(page.getByRole('link', { name: 'Apply free with your CV' })).toHaveAttribute('href', new RegExp(`/login\\?next=.*${listed.id}`));
  await expect(page.getByRole('link', { name: 'Physics jobs in Lagos' })).toHaveAttribute('href', '/jobs/lagos/physics-teacher');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);

  // Anonymous job: no JobPosting, no school name anywhere in the HTML.
  await page.goto(`/jobs/${anon.slug}-${anon.shortId}`);
  await expect(page.getByText('Confidential school').first()).toBeVisible();
  expect((await jsonLd(page)).some((d) => d['@type'] === 'JobPosting')).toBe(false);
  expect(await page.content()).not.toContain('Hidden College');

  // Landing page and search.
  await page.goto('/jobs/lagos');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Teaching jobs in Lagos');
  await page.goto(`/jobs?q=${tag}`);
  await expect(page.getByRole('link', { name: `Physics Teacher ${tag}` })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.goto('/');
  expect((await jsonLd(page)).some((d) => d['@type'] === 'WebSite')).toBe(true);

  // robots.txt and sitemaps.
  const robots = await (await page.request.get('/robots.txt')).text();
  expect(robots).toMatch(/Disallow: \/teacher/);
  expect(robots).toMatch(/Disallow: \/admin/);
  expect(robots).toMatch(/Sitemap: .+\/sitemap\.xml/);
  const index = await (await page.request.get('/sitemap.xml')).text();
  expect(index).toContain('/sitemaps/vacancies.xml');
  const jobsXml = await (await page.request.get('/sitemaps/vacancies.xml')).text();
  expect(jobsXml).toContain(listedPath);

  // Closing the job refreshes its cached page at once (on-demand revalidation): noindex + "closed".
  await director(`/vacancies/${listed.id}/close`, 'POST', { reason: 'filled' });
  await expect
    .poll(async () => {
      await page.goto(listedPath);
      return page.getByText('This position has closed').count();
    }, { timeout: 30_000 })
    .toBeGreaterThan(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  expect((await jsonLd(page)).some((d) => d['@type'] === 'JobPosting')).toBe(false);

  // Private areas stay noindex.
  await page.goto('/login');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
