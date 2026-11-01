import { STATIC_PAGES, type SitemapEntry } from '@edu-forum/shared';
import { serverGet } from '@/lib/server-api';
import { urlset, xml } from '@/lib/sitemap-xml';

// Rendered per request (data from the tagged fetch cache), so builds never need the API.
export const dynamic = 'force-dynamic';

/** About, legal and help pages, plus teaching resources, the calendar and exam timetables. */
export async function GET() {
  const { data } = await serverGet<{ data: SitemapEntry[] }>('/seo/sitemap/resources', ['resources', 'exams']);
  return xml(urlset([...STATIC_PAGES.map((p) => ({ path: p.path })), { path: '/resources' }, { path: '/calendar' }, { path: '/exams' }, ...(data?.data ?? [])]));
}
