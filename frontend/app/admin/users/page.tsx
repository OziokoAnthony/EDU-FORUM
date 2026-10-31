'use client';

import { Suspense } from 'react';
import type { AdminUserItem } from '@edu-forum/shared';
import { useAuth } from '@/lib/auth';
import { shortDate } from '@/lib/format';
import { AdminList } from '../admin-list';
import { AdminNav, askReason } from '../admin-nav';

const ROLE = { teacher: 'Teacher', principal: 'Principal', director: 'Director', admin: 'Admin' } as const;

export default function Page() {
  const { authed } = useAuth();
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <AdminNav current="users" />
      <h1 className="text-2xl font-bold text-slate-900">Users</h1>
      <Suspense>
        <AdminList<AdminUserItem>
          path="/admin/users"
          searchLabel="Email, phone or name"
          filters={[
            { key: 'role', options: Object.entries(ROLE).map(([value, label]) => ({ value, label })) },
            { key: 'status', options: [{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }] },
          ]}
          render={(u, act) => (
            <li key={u.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 p-4">
              <div className="min-w-0">
                <p className="break-all font-semibold text-slate-900">{u.name ?? u.email ?? u.phone}</p>
                <p className="break-all text-sm text-slate-600">
                  {ROLE[u.role]} · {[u.email, u.phone].filter(Boolean).join(' · ')}
                </p>
                <p className="text-sm text-slate-500">
                  Joined {shortDate(u.createdAt)}
                  {u.verified ? '' : ' · email/phone not confirmed'}
                  {u.lastLoginAt ? ` · last sign-in ${shortDate(u.lastLoginAt)}` : ''}
                </p>
                {u.status === 'suspended' ? <p className="text-sm font-semibold text-red-700">Suspended: {u.suspendedReason}</p> : null}
              </div>
              {u.role === 'admin' ? null : u.status === 'active' ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-red-700 underline"
                  onClick={() => {
                    const reason = askReason('suspend this account');
                    if (reason) act(() => authed(`/admin/users/${u.id}/suspend`, { method: 'POST', body: { reason } }), 'Account suspended.');
                  }}
                >
                  Suspend
                </button>
              ) : (
                <button
                  type="button"
                  className="text-sm font-semibold text-emerald-800 underline"
                  onClick={() => act(() => authed(`/admin/users/${u.id}/reinstate`, { method: 'POST' }), 'Account reinstated.')}
                >
                  Reinstate
                </button>
              )}
            </li>
          )}
        />
      </Suspense>
    </main>
  );
}
