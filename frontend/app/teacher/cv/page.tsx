import Link from 'next/link';
import { CvManager } from '@/components/cv-manager';

/** CV can be replaced at any time from here (FR-2 step 7). */
export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/teacher" className="text-sm text-emerald-800 underline">
        ← Back to dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">My CV</h1>
      <div className="mt-6">
        <CvManager showHistory />
      </div>
    </main>
  );
}
