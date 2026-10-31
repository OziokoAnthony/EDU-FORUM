import { SITE_URL } from './server-api';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** An XML response; sitemaps are cached for an hour. */
export function xml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

export function urlset(entries: { path: string; lastmod?: string }[]): string {
  const urls = entries
    .map((e) => `  <url><loc>${esc(`${SITE_URL}${e.path}`)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
    .join('\n');
  return `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

export function sitemapIndex(entries: { path: string; lastmod?: string }[]): string {
  const items = entries
    .map((e) => `  <sitemap><loc>${esc(`${SITE_URL}${e.path}`)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</sitemap>`)
    .join('\n');
  return `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`;
}
