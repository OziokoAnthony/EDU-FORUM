import type { Metadata } from 'next';
import { APP_NAME, type SeoMeta } from '@edu-forum/shared';
import { serverGet, SITE_URL } from './server-api';

/** GET /seo/meta for a public path (cached; refreshed when jobs change). */
export function getSeoMeta(path: string) {
  return serverGet<SeoMeta>(`/seo/meta?path=${encodeURIComponent(path)}`, ['seo']);
}

/** Next metadata from the API's SEO data: unique title/description, canonical, OG/X, robots. */
export function toMetadata(meta: SeoMeta, overrides: { noindex?: boolean } = {}): Metadata {
  const index = meta.indexable && !overrides.noindex;
  const url = `${SITE_URL}${meta.canonical}`;
  return {
    title: meta.kind === 'home' ? { absolute: meta.title } : meta.title,
    description: meta.description,
    alternates: { canonical: meta.canonical },
    // Thin landing pages (< 3 jobs), closed jobs and filtered searches: noindex, but follow links.
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: meta.title, description: meta.description, url, siteName: APP_NAME, locale: 'en_NG', type: 'website' },
    twitter: { card: 'summary', title: meta.title, description: meta.description },
  };
}
