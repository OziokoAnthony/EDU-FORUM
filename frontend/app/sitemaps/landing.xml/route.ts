import type { LandingPageItem } from '@edu-forum/shared';
import { serverGet } from '@/lib/server-api';
import { urlset, xml } from '@/lib/sitemap-xml';

// Rendered per request (data still comes from the tagged fetch cache), so builds never
// need the API running and pages never serve build-time data.
export const dynamic = 'force-dynamic';

/** State, LGA, subject and state×subject pages with at least 3 live jobs (indexable ones only). */
export async function GET() {
  const { data } = await serverGet<{ data: LandingPageItem[] }>('/seo/landing-pages', ['vacancies', 'seo']);
  return xml(urlset([{ path: '/' }, ...(data?.data ?? []).map((p) => ({ path: p.path, lastmod: p.lastmod }))]));
}
