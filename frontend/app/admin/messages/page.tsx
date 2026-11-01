'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CONTACT_TOPIC_LABELS, type AdminContactMessage, type Paginated } from '@edu-forum/shared';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AdminNav } from '../admin-nav';

/** Contact-form messages: reply by email, then close. */
export default function Page() {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['admin-contact', status],
    queryFn: () =>
      authed<Paginated<AdminContactMessage>>(`/admin/contact-messages?status=${status}&limit=50`),
  });

  async function close(id: string) {
    setError(null);
    try {
      await authed(`/admin/contact-messages/${id}/close`, { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['admin-contact'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not close the message.');
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <AdminNav current="messages" />
      <h1 className="text-2xl text-slate-900">Contact messages</h1>
      <div role="tablist" aria-label="Message status" className="flex gap-2">
        {(['open', 'closed'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize ${status === s ? 'bg-brand text-white' : 'bg-panel text-slate-700 shadow-sm'}`}
          >
            {s}
          </button>
        ))}
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {list.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : list.isError ? (
        <Alert>{list.error.message}</Alert>
      ) : list.data.data.length === 0 ? (
        <p className="rounded-lg bg-panel p-6 text-center text-slate-600 shadow-sm">
          No {status} messages.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.data.data.map((m) => (
            <li key={m.id} className="space-y-2 rounded-lg bg-panel p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">
                  {m.name} · {CONTACT_TOPIC_LABELS[m.topic]}
                </p>
                <span className="text-xs text-slate-500">
                  {new Date(m.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: your message to EDU-FORUM`)}`}
                  className="font-semibold text-brand hover:underline"
                >
                  {m.email}
                </a>
                {m.userRole ? ` · signed in as a ${m.userRole}` : ' · not signed in'}
              </p>
              <p className="whitespace-pre-line rounded-md bg-slate-50 p-3 text-slate-800">
                {m.message}
              </p>
              {m.status === 'open' ? (
                <button
                  type="button"
                  onClick={() => void close(m.id)}
                  className="text-sm font-semibold text-slate-700 underline"
                >
                  Mark as dealt with
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
