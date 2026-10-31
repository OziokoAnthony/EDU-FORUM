import type { LandingPageItem, SitemapEntry } from '@edu-forum/shared';
import { serverGet } from '@/lib/server-api';
import { sitemapIndex, xml } from '@/lib/sitemap-xml';

// Rendered per request (data still comes from the tagged fetch cache), so builds never
// need the API running and pages never serve build-time data.
export const dynamic = 'force-dynamic';

const newest = (items: { lastmod: string }[]) => items.map((i) => i.lastmod).sort().at(-1);

/** Sitemap index (CLAUDE.md): vacancies and landing pages; blog joins in Phase 12. */
export async function GET() {
  const [{ data: jobs }, { data: landing }] = await Promise.all([
    serverGet<{ data: SitemapEntry[] }>('/seo/sitemap/vacancies', ['vacancies']),
    serverGet<{ data: LandingPageItem[] }>('/seo/landing-pages', ['vacancies', 'seo']),
  ]);
  return xml(
    sitemapIndex([
      { path: '/sitemaps/vacancies.xml', lastmod: newest(jobs?.data ?? []) },
      { path: '/sitemaps/landing.xml', lastmod: newest(landing?.data ?? []) },
    ]),
  );
}
