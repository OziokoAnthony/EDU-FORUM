'use client';

import Link from 'next/link';
import { InterviewsList } from '@/components/interviews-page';

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link href="/teacher" className="text-sm text-emerald-800 underline">
        ← Back to dashboard
      </Link>
      <h1 className="text-3xl text-slate-900">My interviews</h1>
      <p className="text-sm text-slate-600">Times are Nigerian time (WAT). Confirm, or suggest a time that suits you better.</p>
      <InterviewsList as="teacher" empty="No upcoming interviews yet." />
    </main>
  );
}
