import type { Metadata } from 'next';
import { breadcrumbJsonLd, LEGAL, STATIC_PAGES } from '@edu-forum/shared';
import { JsonLd } from '@/components/json-ld';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';
import { SITE_URL } from '@/lib/server-api';
import { Breadcrumbs } from './breadcrumbs';

type PagePath = (typeof STATIC_PAGES)[number]['path'];

/** Metadata for an about/legal/help page, from GET /seo/meta (falls back to the shared text). */
export async function staticMetadata(path: PagePath): Promise<Metadata> {
  const { data: meta } = await getSeoMeta(path);
  if (meta) return toMetadata(meta);
  const p = STATIC_PAGES.find((x) => x.path === path)!;
  return { title: p.title, description: p.description, alternates: { canonical: path } };
}

/** About, legal and help pages: one h1, breadcrumbs (with JSON-LD), readable text, no ads. */
export function StaticPage({ path, legal = false, intro, children }: { path: PagePath; legal?: boolean; intro?: string; children: React.ReactNode }) {
  const p = STATIC_PAGES.find((x) => x.path === path)!;
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: p.name, path },
  ];
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-0">
      <JsonLd data={breadcrumbJsonLd(crumbs, SITE_URL)} />
      <Breadcrumbs crumbs={crumbs} />
      <article className="space-y-4 rounded-lg bg-panel p-5 shadow-sm sm:p-8">
        <h1 className="text-3xl text-slate-900">{p.name}</h1>
        {legal ? <p className="text-sm text-slate-500">Last updated: {LEGAL.lastUpdated}</p> : null}
        {intro ? <p className="text-lg text-slate-700">{intro}</p> : null}
        <div className="prose-blog">{children}</div>
      </article>
    </main>
  );
}
