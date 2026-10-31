import type { Metadata } from 'next';
import { JoinSchool } from './join-school';

export const metadata: Metadata = { title: 'Join a school team' };

/** Landing page for the team invite email link (?token=). */
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <JoinSchool token={token ?? null} />;
}
