import type { SitemapEntry } from '@edu-forum/shared';
import { serverGet } from '@/lib/server-api';
import { urlset, xml } from '@/lib/sitemap-xml';

// Rendered per request (data still comes from the tagged fetch cache), so builds never need the API.
export const dynamic = 'force-dynamic';

/** Approved blog posts with accurate lastmod. */
export async function GET() {
  const { data } = await serverGet<{ data: SitemapEntry[] }>('/seo/sitemap/blog', ['blog']);
  return xml(urlset([{ path: '/blog' }, ...(data?.data ?? [])]));
}
