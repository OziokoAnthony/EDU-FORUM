'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { PROFILE_VIEW_KIND_LABELS, type Paginated, type ProfileViewItem, type ProfileViewsSummary } from '@edu-forum/shared';
import { Alert } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const WHO = { principal: 'A principal', director: 'A director', deleted: 'A deleted account' } as const;
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' });

/** Who viewed my profile or CV (FR-6). Viewers appear by role only. */
export default function Page() {
  const { authed } = useAuth();
  const [page, setPage] = useState(1);
  const views = useQuery({
    queryKey: ['profile-views', page],
    queryFn: () => authed<Paginated<ProfileViewItem> & { summary: ProfileViewsSummary }>(`/teachers/me/profile-views?page=${page}&limit=20`),
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <Link href="/teacher" className="text-sm text-emerald-800 underline">
        ← Back to dashboard
      </Link>
      <h1 className="text-3xl text-slate-900">Who viewed my profile</h1>
      {views.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : views.isError ? (
        <Alert>{views.error.message}</Alert>
      ) : (
        <>
          <p className="text-slate-700">
            This week: <span className="font-semibold">{views.data.summary.cvViewers}</span> viewed your CV, and{' '}
            <span className="font-semibold">{views.data.summary.viewers}</span> visited your profile.
          </p>
          {views.data.data.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-600">
              No views yet. A complete, published profile shows up more often in searches.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-panel">
              {views.data.data.map((v) => (
                <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                  <span className="text-slate-800">
                    {WHO[v.viewerRole]} {PROFILE_VIEW_KIND_LABELS[v.kind]}
                  </span>
                  <span className="text-sm text-slate-500">{when(v.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          {views.data.meta.total > views.data.meta.limit ? (
            <div className="flex justify-between">
              <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="font-semibold text-emerald-800 underline disabled:opacity-40">
                ← Newer
              </button>
              <button
                type="button"
                disabled={page * views.data.meta.limit >= views.data.meta.total}
                onClick={() => setPage((p) => p + 1)}
                className="font-semibold text-emerald-800 underline disabled:opacity-40"
              >
                Older →
              </button>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
