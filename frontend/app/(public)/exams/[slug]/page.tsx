import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { breadcrumbJsonLd, type ExamDetail } from '@edu-forum/shared';
import { JsonLd } from '@/components/json-ld';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { dateRange, fileSize } from '@/components/resources/resource-bits';
import { API_URL } from '@/lib/api';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';
import { serverGet, SITE_URL } from '@/lib/server-api';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data: meta } = await getSeoMeta(`/exams/${slug}`);
  return meta ? toMetadata(meta) : {};
}

/** `/exams/{slug}`: the official timetables for one exam, newest first, free download. */
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const [{ data: meta }, { data: exam }] = await Promise.all([getSeoMeta(`/exams/${slug}`), serverGet<ExamDetail>(`/exams/${slug}`, ['exams'])]);
  if (!meta || !exam) notFound();
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-0">
      <JsonLd data={breadcrumbJsonLd(meta.breadcrumbs, SITE_URL)} />
      <Breadcrumbs crumbs={meta.breadcrumbs} />
      <div className="space-y-1">
        <h1 className="text-3xl text-slate-900">{exam.name} timetable</h1>
        <p className="text-slate-600">{exam.fullName}</p>
        {exam.description ? <p className="text-slate-600">{exam.description}</p> : null}
      </div>
      {exam.timetables.length === 0 ? (
        <p className="rounded-lg bg-panel p-6 text-center text-slate-600 shadow-sm">The timetable will be posted here as soon as it is released.</p>
      ) : (
        <ul className="space-y-3">
          {exam.timetables.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-panel p-4 shadow-sm">
              <div>
                <h2 className="text-lg text-slate-900">
                  {t.session} {t.year}
                </h2>
                <p className="text-sm text-slate-600">
                  {t.startDate ? dateRange(t.startDate, t.endDate) : 'Dates in the timetable'} · {t.fileType}, {fileSize(t.sizeBytes)}
                </p>
              </div>
              <a href={`${API_URL}/exams/timetables/${t.id}/file`} className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-600" rel="nofollow">
                Download timetable
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-slate-600">
        Always check the exam body&apos;s own website for last-minute changes. See all <Link href="/exams" className="font-semibold text-brand hover:underline">exam timetables</Link> or the{' '}
        <Link href="/calendar" className="font-semibold text-brand hover:underline">school calendar</Link>.
      </p>
    </main>
  );
}
