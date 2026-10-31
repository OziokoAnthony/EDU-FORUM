import { Recommended } from './recommended';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Recommended id={id} />;
}
