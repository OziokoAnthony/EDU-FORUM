import { ApplicantDetail } from './applicant-detail';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplicantDetail id={id} />;
}
