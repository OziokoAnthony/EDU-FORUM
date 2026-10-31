'use client';

import { useAuth } from '@/lib/auth';

/** Temporary home for each private area until its phase builds the real dashboard. */
export function AreaPlaceholder({ title, next }: { title: string; next: string }) {
  const { user } = useAuth();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-slate-600">Signed in as {user?.email ?? user?.phone}.</p>
      <p className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">{next}</p>
    </main>
  );
}
