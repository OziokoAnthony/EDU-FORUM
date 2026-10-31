'use client';

import { useQuery } from '@tanstack/react-query';
import type { Paginated, SavedEntry } from '@edu-forum/shared';
import { SAVED_KEY, SaveButton, SavedSearches } from '@/components/saved';
import { TeacherCard } from '@/components/teacher-card';
import { Alert } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { HiringNav } from '../hiring-nav';

/** Saved teachers and teacher-search alerts. */
export default function Page() {
  const { authed } = useAuth();
  const saved = useQuery({ queryKey: [...SAVED_KEY, 'list'], queryFn: () => authed<Paginated<SavedEntry>>('/saved?limit=50'), staleTime: 0 });

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <HiringNav current="saved" />
      <section className="space-y-3">
        <h1 className="text-3xl text-slate-900">Saved teachers</h1>
        {saved.isPending ? (
          <p className="text-slate-500">Loading…</p>
        ) : saved.isError ? (
          <Alert>{saved.error.message}</Alert>
        ) : saved.data.data.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-600">No saved teachers yet. Tap ☆ Save on a teacher’s profile.</p>
        ) : (
          <ul className="stagger space-y-4">
            {saved.data.data.map((e) =>
              e.itemType === 'teacher' ? (
                <li key={e.id} className="space-y-2">
                  {e.teacher?.available ? (
                    <ul>
                      <TeacherCard t={{ ...e.teacher, matchScore: 0, distanceKm: null }} showMatch={false} />
                    </ul>
                  ) : (
                    <p className="rounded-md border border-slate-200 p-4 text-slate-600">{e.teacher?.fullName ?? 'This teacher'}’s profile is not available right now.</p>
                  )}
                  <SaveButton itemType="teacher" itemId={e.itemId} />
                </li>
              ) : null,
            )}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl text-slate-900">Teacher alerts</h2>
        <SavedSearches resultsPath="/hiring/teachers" />
      </section>
    </main>
  );
}
