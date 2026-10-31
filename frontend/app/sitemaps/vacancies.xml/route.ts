import type { SitemapEntry } from '@edu-forum/shared';
import { serverGet } from '@/lib/server-api';
import { urlset, xml } from '@/lib/sitemap-xml';

// Rendered per request (data still comes from the tagged fetch cache), so builds never
// need the API running and pages never serve build-time data.
export const dynamic = 'force-dynamic';

/** Live job pages with accurate lastmod. */
export async function GET() {
  const { data } = await serverGet<{ data: SitemapEntry[] }>('/seo/sitemap/vacancies', ['vacancies']);
  return xml(urlset([{ path: '/jobs' }, ...(data?.data ?? [])]));
}
