import Link from 'next/link';
import { VacancyForm } from '../vacancy-form';

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/hiring" className="text-sm text-emerald-800 underline">
        ← Back to vacancies
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Post a vacancy</h1>
      <div className="mt-6">
        <VacancyForm />
      </div>
    </main>
  );
}
