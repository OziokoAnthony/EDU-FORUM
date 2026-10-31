'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { InterviewItem, Paginated } from '@edu-forum/shared';
import { Alert } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { INTERVIEWS_KEY, InterviewCard } from './interview-card';

/** Upcoming and past interviews, for teachers and for principals/directors. */
export function InterviewsList({ as, empty }: { as: 'teacher' | 'poster'; empty: React.ReactNode }) {
  const { authed } = useAuth();
  const [past, setPast] = useState(false);
  const list = useQuery({
    queryKey: [...INTERVIEWS_KEY, 'me', past],
    queryFn: () => authed<Paginated<InterviewItem>>(`/interviews/me?limit=50${past ? '&past=true' : ''}`),
    staleTime: 0,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-1" role="tablist" aria-label="Which interviews">
        {[false, true].map((p) => (
          <button
            key={String(p)}
            type="button"
            role="tab"
            aria-selected={past === p}
            onClick={() => setPast(p)}
            className={`rounded-full px-3 py-1.5 text-sm ${past === p ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {p ? 'Past' : 'Upcoming'}
          </button>
        ))}
      </div>
      {list.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : list.isError ? (
        <Alert>{list.error.message}</Alert>
      ) : list.data.data.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-600">{past ? 'No past interviews.' : empty}</p>
      ) : (
        <ul className="stagger space-y-3">
          {list.data.data.map((iv) => (
            <InterviewCard key={iv.id} iv={iv} as={as} />
          ))}
        </ul>
      )}
    </div>
  );
}
