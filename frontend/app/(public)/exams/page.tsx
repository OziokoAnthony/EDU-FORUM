import type { Metadata } from 'next';
import Link from 'next/link';
import { breadcrumbJsonLd, type ExamItem } from '@edu-forum/shared';
import { JsonLd } from '@/components/json-ld';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';
import { serverGet, SITE_URL } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  const { data: meta } = await getSeoMeta('/exams');
  return meta ? toMetadata(meta) : {};
}

/** `/exams`: every exam with its latest official timetable. */
export default async function Page() {
  const [{ data: meta }, { data: exams }] = await Promise.all([getSeoMeta('/exams'), serverGet<ExamItem[]>('/exams', ['exams'])]);
  const crumbs = meta?.breadcrumbs ?? [{ name: 'Home', path: '/' }, { name: 'Exam timetables', path: '/exams' }];
  return (
    <main className="space-y-5 px-4 py-6 sm:px-0">
      <JsonLd data={breadcrumbJsonLd(crumbs, SITE_URL)} />
      <Breadcrumbs crumbs={crumbs} />
      <div className="space-y-1">
        <h1 className="text-3xl text-slate-900">Exam timetables</h1>
        <p className="text-slate-600">Official timetables for WAEC, NECO, NABTEB, JAMB, BECE and more, uploaded by our team. Free to download.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(exams ?? []).map((e) => (
          <li key={e.id} className="lift rounded-lg bg-panel p-4 shadow-sm">
            <Link href={e.path} className="block space-y-1">
              <h2 className="text-lg text-slate-900">{e.name}</h2>
              <p className="text-sm text-slate-600">{e.fullName}</p>
              <p className="text-sm font-semibold text-brand">{e.latest ? `${e.latest.session} ${e.latest.year} timetable` : 'Timetable coming soon'}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
