import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LandingView } from '@/components/public/landing-view';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';

type Props = { params: Promise<{ subject: string }>; searchParams: Promise<{ page?: string }> };

/** `/jobs/subject/{subject}` */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { subject } = await params;
  const { page } = await searchParams;
  const { data: meta } = await getSeoMeta(`/jobs/subject/${subject}`);
  return meta ? toMetadata(meta, { noindex: !!page && page !== '1' }) : {};
}

export default async function Page({ params, searchParams }: Props) {
  const { subject } = await params;
  const { page } = await searchParams;
  const { data: meta } = await getSeoMeta(`/jobs/subject/${subject}`);
  if (!meta) notFound();
  return <LandingView meta={meta} page={Math.max(1, Number(page) || 1)} />;
}
