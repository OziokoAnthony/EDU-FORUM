import { TeacherProfile } from './teacher-profile';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeacherProfile id={id} />;
}
