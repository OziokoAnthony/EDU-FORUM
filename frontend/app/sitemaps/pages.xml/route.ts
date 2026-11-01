import { STATIC_PAGES } from '@edu-forum/shared';
import { urlset, xml } from '@/lib/sitemap-xml';

/** About, legal and help pages. */
export function GET() {
  return xml(urlset(STATIC_PAGES.map((p) => ({ path: p.path }))));
}
