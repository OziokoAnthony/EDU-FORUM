import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { breadcrumbJsonLd, MATERIAL_KIND_LABELS, TERM_LABELS, type MaterialItem } from '@edu-forum/shared';
import { JsonLd } from '@/components/json-ld';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { DownloadButton } from '@/components/resources/download-button';
import { fileSize, MaterialCard } from '@/components/resources/resource-bits';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';
import { serverGet, SITE_URL } from '@/lib/server-api';

type Props = { params: Promise<{ slug: string }> };
type Detail = MaterialItem & { related: MaterialItem[] };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data: meta } = await getSeoMeta(`/resources/${slug}`);
  return meta ? toMetadata(meta) : {};
}

/** One teaching material: details for everyone, download for members. */
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const [{ data: meta }, { data: m }] = await Promise.all([getSeoMeta(`/resources/${slug}`), serverGet<Detail>(`/materials/by-slug/${slug}`, ['resources'])]);
  if (!meta || !m) notFound();
  const facts: [string, string][] = [
    ['Type', MATERIAL_KIND_LABELS[m.kind]],
    ...(m.subject ? [['Subject', m.subject.name] as [string, string]] : []),
    ...(m.classLevel ? [['Class', m.classLevel.name] as [string, string]] : []),
    ...(m.term ? [['Term', TERM_LABELS[m.term]] as [string, string]] : []),
    ['File', `${m.fileType}, ${fileSize(m.sizeBytes)}`],
    ['Downloads', m.downloads.toLocaleString('en-NG')],
  ];
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-0">
      <JsonLd data={breadcrumbJsonLd(meta.breadcrumbs, SITE_URL)} />
      <Breadcrumbs crumbs={meta.breadcrumbs} />
      <article className="space-y-4 rounded-lg bg-panel p-5 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase text-brand">{MATERIAL_KIND_LABELS[m.kind]}</p>
        <h1 className="text-3xl leading-tight text-slate-900">{m.title}</h1>
        <p className="whitespace-pre-line text-slate-700">{m.description}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-3">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-semibold text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
        <DownloadButton id={m.id} path={m.path} />
      </article>
      {m.related.length ? (
        <section className="space-y-3">
          <h2 className="text-xl text-slate-900">Related resources</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {m.related.map((r) => (
              <MaterialCard key={r.id} m={r} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
