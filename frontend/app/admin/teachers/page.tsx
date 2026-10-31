'use client';

import { Suspense } from 'react';
import type { AdminTeacherItem } from '@edu-forum/shared';
import { useAuth } from '@/lib/auth';
import { shortDate } from '@/lib/format';
import { AdminList } from '../admin-list';
import { AdminNav, askReason } from '../admin-nav';

export default function Page() {
  const { authed } = useAuth();
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <AdminNav current="teachers" />
      <h1 className="text-2xl font-bold text-slate-900">Teacher profiles</h1>
      <Suspense>
        <AdminList<AdminTeacherItem>
          path="/admin/teachers"
          searchLabel="Name or email"
          filters={[
            { key: 'published', options: [{ value: 'true', label: 'Published' }, { value: 'false', label: 'Not published' }] },
            { key: 'hidden', options: [{ value: 'true', label: 'Hidden by admin' }] },
          ]}
          render={(t, act) => (
            <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 p-4">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{t.fullName ?? 'No name yet'}</p>
                <p className="break-all text-sm text-slate-600">
                  {t.email} · {[t.lga, t.state].filter(Boolean).join(', ') || 'No location'}
                </p>
                <p className="text-sm text-slate-500">
                  {t.isPublished ? 'Published' : 'Not published'} · {t.completenessScore}% complete · updated {shortDate(t.updatedAt)}
                </p>
                {t.moderationNote ? <p className="text-sm font-semibold text-red-700">Hidden: {t.moderationNote}</p> : null}
              </div>
              {t.moderationNote ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-emerald-800 underline"
                  onClick={() => act(() => authed(`/admin/teachers/${t.id}/restore`, { method: 'POST' }), 'Profile restored. The teacher can publish again.')}
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="text-sm font-semibold text-red-700 underline"
                  onClick={() => {
                    const reason = askReason('hide this profile');
                    if (reason) act(() => authed(`/admin/teachers/${t.id}/unpublish`, { method: 'POST', body: { reason } }), 'Profile hidden.');
                  }}
                >
                  Hide profile
                </button>
              )}
            </li>
          )}
        />
      </Suspense>
    </main>
  );
}
