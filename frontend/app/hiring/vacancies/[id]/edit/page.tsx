import { EditVacancy } from './edit-vacancy';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditVacancy id={id} />;
}
