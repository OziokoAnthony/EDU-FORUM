'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { META_TYPES, type MetaType } from '@edu-forum/shared';
import { Select } from '@/components/form';
import { Alert, Field } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useStates } from '@/lib/meta';
import { AdminNav } from '../admin-nav';

const LABEL: Record<MetaType, string> = {
  subjects: 'Subjects',
  levels: 'Levels',
  'qualification-types': 'Qualifications',
  'certification-types': 'Certifications',
  lgas: 'LGAs / cities',
};

interface Item {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  rank?: number;
  issuer?: string | null;
  state?: { name: string };
}

/** PRD reference-data management. Removing deactivates: existing profiles and vacancies keep it. */
export default function Page() {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const states = useStates();
  const [type, setType] = useState<MetaType>('subjects');
  const [name, setName] = useState('');
  const [extra, setExtra] = useState('');
  const [stateId, setStateId] = useState('');
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const key = ['admin', 'meta', type];
  const items = useQuery({ queryKey: key, queryFn: async () => (await authed<{ data: Item[] }>(`/admin/meta/${type}`)).data, staleTime: 0 });

  async function run(fn: () => Promise<unknown>, ok: string) {
    setNotice(null);
    try {
      await fn();
      setNotice({ kind: 'success', text: ok });
      await qc.invalidateQueries({ queryKey: key });
      await qc.invalidateQueries({ queryKey: ['meta'] });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { name };
    if (type === 'qualification-types' && extra) body.rank = Number(extra);
    if (type === 'certification-types' && extra) body.issuer = extra;
    if (type === 'lgas') body.stateId = stateId;
    void run(async () => {
      await authed(`/admin/meta/${type}`, { method: 'POST', body });
      setName('');
      setExtra('');
    }, `Added ${name}.`);
  }

  const shown = (items.data ?? []).filter((i) => !filter || `${i.name} ${i.state?.name ?? ''}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <AdminNav current="reference" />
      <h1 className="text-2xl font-bold text-slate-900">Reference data</h1>
      <div className="flex flex-wrap gap-2" role="tablist">
        {META_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={type === t}
            onClick={() => setType(t)}
            className={`rounded-full px-3 py-1.5 text-sm ${type === t ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {LABEL[t]}
          </button>
        ))}
      </div>

      <form onSubmit={add} className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
        <Field label={`New ${LABEL[type].toLowerCase().replace(/s$/, '')}`} name="name" value={name} onChange={(e) => setName(e.target.value)} />
        {type === 'qualification-types' ? (
          <Field label="Rank (higher = more advanced)" name="rank" type="number" value={extra} onChange={(e) => setExtra(e.target.value)} />
        ) : type === 'certification-types' ? (
          <Field label="Issuer (optional)" name="issuer" value={extra} onChange={(e) => setExtra(e.target.value)} />
        ) : type === 'lgas' ? (
          <Select label="State" name="stateId" placeholder="Choose…" value={stateId} onChange={(e) => setStateId(e.target.value)} options={(states.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        ) : (
          <div />
        )}
        <div className="flex items-end">
          <button type="submit" disabled={name.trim().length < 2} className="rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
            Add
          </button>
        </div>
      </form>

      {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}
      <Field label="Filter" name="filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {items.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {shown.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <p className={i.isActive ? 'text-slate-900' : 'text-slate-400 line-through'}>
                  {i.name}
                  {i.state ? <span className="text-slate-500"> · {i.state.name}</span> : null}
                  {i.rank !== undefined ? <span className="text-slate-500"> · rank {i.rank}</span> : null}
                </p>
                <p className="text-xs text-slate-500">{i.slug}</p>
              </div>
              <div className="flex gap-3 text-sm font-semibold">
                <button
                  type="button"
                  className="text-emerald-800 underline"
                  onClick={() => {
                    const next = window.prompt('New name (the URL slug stays the same):', i.name);
                    if (next && next.trim().length >= 2) void run(() => authed(`/admin/meta/${type}/${i.id}`, { method: 'PATCH', body: { name: next.trim() } }), 'Renamed.');
                  }}
                >
                  Rename
                </button>
                {i.isActive ? (
                  <button type="button" className="text-red-700 underline" onClick={() => void run(() => authed(`/admin/meta/${type}/${i.id}`, { method: 'DELETE' }), `${i.name} removed from the lists.`)}>
                    Remove
                  </button>
                ) : (
                  <button type="button" className="text-emerald-800 underline" onClick={() => void run(() => authed(`/admin/meta/${type}/${i.id}`, { method: 'PATCH', body: { isActive: true } }), `${i.name} restored.`)}>
                    Restore
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
