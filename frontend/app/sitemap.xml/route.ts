import type { LandingPageItem, SitemapEntry } from '@edu-forum/shared';
import { serverGet } from '@/lib/server-api';
import { sitemapIndex, xml } from '@/lib/sitemap-xml';

// Rendered per request (data still comes from the tagged fetch cache), so builds never
// need the API running and pages never serve build-time data.
export const dynamic = 'force-dynamic';

const newest = (items: { lastmod: string }[]) => items.map((i) => i.lastmod).sort().at(-1);

/** Sitemap index (CLAUDE.md): vacancies, landing pages and the blog. */
export async function GET() {
  const [{ data: jobs }, { data: landing }, { data: blog }] = await Promise.all([
    serverGet<{ data: SitemapEntry[] }>('/seo/sitemap/vacancies', ['vacancies']),
    serverGet<{ data: LandingPageItem[] }>('/seo/landing-pages', ['vacancies', 'seo']),
    serverGet<{ data: SitemapEntry[] }>('/seo/sitemap/blog', ['blog']),
  ]);
  return xml(
    sitemapIndex([
      { path: '/sitemaps/vacancies.xml', lastmod: newest(jobs?.data ?? []) },
      { path: '/sitemaps/landing.xml', lastmod: newest(landing?.data ?? []) },
      { path: '/sitemaps/blog.xml', lastmod: newest(blog?.data ?? []) },
    ]),
  );
}
