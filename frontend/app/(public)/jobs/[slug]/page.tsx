import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { JobPageResponse } from '@edu-forum/shared';
import { JobView } from '@/components/public/job-view';
import { LandingView } from '@/components/public/landing-view';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';
import { serverGet } from '@/lib/server-api';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

/** `/jobs/{state}` (landing page) or `/jobs/{slug}-{shortId}` (job page): the API tells which. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { page } = await searchParams;
  const { data: meta } = await getSeoMeta(`/jobs/${slug}`);
  if (!meta) return {};
  // Later result pages are not indexed separately (canonical stays the first page).
  return toMetadata(meta, { noindex: !!page && page !== '1' });
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page } = await searchParams;
  const { data: meta } = await getSeoMeta(`/jobs/${slug}`);
  if (!meta) notFound();
  if (meta.kind === 'job') {
    const { data } = await serverGet<JobPageResponse>(`/vacancies/by-slug/${encodeURIComponent(slug)}`, ['vacancies', `vacancy:${slug.slice(-8)}`]);
    if (!data) notFound();
    return <JobView page={data} />;
  }
  return <LandingView meta={meta} page={Math.max(1, Number(page) || 1)} />;
}
