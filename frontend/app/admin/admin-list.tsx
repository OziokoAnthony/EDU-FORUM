'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { Paginated } from '@edu-forum/shared';
import { SecondaryButton } from '@/components/form';
import { Alert, Field } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export type Act = (fn: () => Promise<unknown>, ok: string) => void;

/**
 * Shared admin list page: keyword search, filter chips (from the URL on first load), a list
 * and an `act` helper that runs an action, shows the result and refreshes the data.
 */
export function AdminList<T>({
  path,
  filters,
  searchLabel,
  render,
}: {
  path: string;
  filters: { key: string; options: { value: string; label: string }[] }[];
  searchLabel: string;
  render: (item: T, act: Act) => ReactNode;
}) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(filters.map((f) => [f.key, params.get(f.key) ?? ''])),
  );
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const search = new URLSearchParams({ page: String(page), limit: '20', ...(query ? { q: query } : {}) });
  for (const [k, v] of Object.entries(chosen)) if (v) search.set(k, v);
  const list = useQuery({ queryKey: ['admin', path, search.toString()], queryFn: () => authed<Paginated<T>>(`${path}?${search}`), staleTime: 0 });

  const act: Act = (fn, ok) => {
    setNotice(null);
    fn()
      .then(() => {
        setNotice({ kind: 'success', text: ok });
        return qc.invalidateQueries({ queryKey: ['admin'] });
      })
      .catch((err) => setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' }));
  };
  const total = list.data?.meta.total ?? 0;

  return (
    <div className="space-y-4">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(q);
        }}
      >
        <div className="flex-1">
          <Field label={searchLabel} name="q" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button type="submit" className="rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white">
          Search
        </button>
      </form>
      {filters.map((f) => (
        <div key={f.key} className="flex flex-wrap gap-2">
          {[{ value: '', label: 'All' }, ...f.options].map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={chosen[f.key] === o.value}
              onClick={() => {
                setPage(1);
                setChosen((c) => ({ ...c, [f.key]: o.value }));
              }}
              className={`rounded-full px-3 py-1 text-sm ${chosen[f.key] === o.value ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      ))}
      {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}
      {list.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : list.isError ? (
        <Alert>{list.error.message}</Alert>
      ) : list.data.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">Nothing found.</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">{total} found</p>
          <ul className="space-y-3">{list.data.data.map((item) => render(item, act))}</ul>
          <div className="flex gap-3">
            <SecondaryButton disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </SecondaryButton>
            <SecondaryButton disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>
              Next
            </SecondaryButton>
          </div>
        </>
      )}
    </div>
  );
}
