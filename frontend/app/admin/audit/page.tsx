'use client';

import { Suspense } from 'react';
import type { AuditLogItem } from '@edu-forum/shared';
import { AdminList } from '../admin-list';
import { AdminNav } from '../admin-nav';

/** FR-11 audit trail of every admin action. */
export default function Page() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <AdminNav current="audit" />
      <h1 className="text-2xl font-bold text-slate-900">Audit log</h1>
      <Suspense>
        <AdminList<AuditLogItem>
          path="/admin/audit-logs"
          searchLabel="Target id"
          filters={[
            {
              key: 'action',
              options: [
                { value: 'user.', label: 'Users' },
                { value: 'vacancy.', label: 'Vacancies' },
                { value: 'teacher.', label: 'Teachers' },
                { value: 'report.', label: 'Reports' },
                { value: 'meta.', label: 'Reference data' },
              ],
            },
          ]}
          render={(a) => (
            <li key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-semibold text-slate-900">
                {a.action} <span className="font-normal text-slate-500">on {a.targetType}</span>
              </p>
              <p className="break-all text-slate-600">
                {new Date(a.createdAt).toLocaleString('en-NG')} · by {a.actor?.email ?? 'system'}
                {a.targetId ? ` · ${a.targetId}` : ''}
              </p>
              {Object.keys(a.metadata).length ? <p className="break-all text-slate-500">{JSON.stringify(a.metadata)}</p> : null}
            </li>
          )}
        />
      </Suspense>
    </main>
  );
}
