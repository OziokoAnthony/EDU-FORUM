'use client';

import Link from 'next/link';
import { TeamManager } from '@/components/team-manager';
import { useMySchool } from '@/lib/school';

export default function Page() {
  const school = useMySchool();
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/school" className="text-sm text-emerald-800 underline">
        ← Back to dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Team</h1>
      <div className="mt-6">{school.data ? <TeamManager isOwner={school.data.myRole === 'owner'} /> : null}</div>
    </main>
  );
}
