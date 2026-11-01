'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ALERT_FREQUENCIES,
  ALERT_FREQUENCY_LABELS,
  type AlertFrequency,
  type Paginated,
  type SavedEntry,
  type SavedItemType,
  type SavedSearchItem,
} from '@edu-forum/shared';
import { SecondaryButton, Select } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export const SAVED_KEY = ['saved'] as const;

/** Save / Saved toggle for a job (teachers) or a teacher (principals/directors). */
export function SaveButton({ itemType, itemId }: { itemType: SavedItemType; itemId: string }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const key = [...SAVED_KEY, 'one', itemId];
  const state = useQuery({ queryKey: key, queryFn: () => authed<Paginated<SavedEntry>>(`/saved?itemId=${itemId}`) });
  const saved = state.data?.data[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (saved) await authed(`/saved/${saved.id}`, { method: 'DELETE' });
      else await authed('/saved', { method: 'POST', body: { itemType, itemId } });
      await qc.invalidateQueries({ queryKey: SAVED_KEY });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        aria-pressed={!!saved}
        disabled={busy || state.isPending}
        onClick={() => void toggle()}
        className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 font-semibold disabled:opacity-60 ${saved ? 'border-gold bg-gold/15 text-gold' : 'border-slate-300 text-slate-800 hover:bg-slate-50'}`}
      >
        <span aria-hidden>{saved ? '★' : '☆'}</span>
        {saved ? 'Saved' : 'Save'}
      </button>
      {error ? <span className="text-sm text-red-600">{error}</span> : null}
    </span>
  );
}

/** Reads the search page's filters from the URL once (links from alerts and saved searches). */
export function useFiltersFromUrl<F extends Record<string, string | boolean>>(apply: (values: Partial<F>) => void): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if ([...params.keys()].length === 0) return;
    const values: Record<string, string | boolean> = {};
    params.forEach((v, k) => (values[k] = v === 'true' ? true : v));
    apply(values as Partial<F>);
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** "Save this search" with an alert frequency (daily by default). */
export function SaveSearch({ filters, savedHref }: { filters: Record<string, string | boolean>; savedHref: string }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<AlertFrequency>('daily');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: React.ReactNode } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const clean = Object.fromEntries(
      Object.entries(filters)
        .filter(([k, v]) => k !== 'sort' && v !== '' && v !== false)
        .map(([k, v]) => [k, String(v)]),
    );
    try {
      await authed<SavedSearchItem>('/saved-searches', { method: 'POST', body: { name, filters: clean, alertFrequency: frequency } });
      setOpen(false);
      setName('');
      setNotice({
        kind: 'success',
        text: (
          <>
            Search saved.{' '}
            <Link href={savedHref} className="font-semibold underline">
              Manage saved searches
            </Link>
          </>
        ),
      });
      void qc.invalidateQueries({ queryKey: [...SAVED_KEY, 'searches'] });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? (Object.values(err.fieldErrors())[0] ?? err.message) : 'Could not save the search.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}
      {open ? (
        <form onSubmit={save} noValidate className="animate-fade-up space-y-3 rounded-lg border border-slate-200 bg-panel shadow-sm p-4">
          <Field label="Name this search" id="search-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Physics jobs near Ikeja" />
          <Select
            label="Alert me"
            id="search-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as AlertFrequency)}
            options={ALERT_FREQUENCIES.map((f) => ({ value: f, label: ALERT_FREQUENCY_LABELS[f] }))}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy} className="sm:w-auto">
              Save search
            </Button>
            <SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
          </div>
        </form>
      ) : (
        <SecondaryButton onClick={() => setOpen(true)}>☆ Save this search and get alerts</SecondaryButton>
      )}
    </div>
  );
}

/** Saved searches list: change alert frequency, open results, delete. */
export function SavedSearches({ resultsPath }: { resultsPath: string }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const key = [...SAVED_KEY, 'searches'];
  const list = useQuery({ queryKey: key, queryFn: () => authed<SavedSearchItem[]>('/saved-searches'), staleTime: 0 });
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: key });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    }
  }

  if (list.isPending) return <p className="text-slate-500">Loading…</p>;
  if (list.isError) return <Alert>{list.error.message}</Alert>;
  return (
    <div className="space-y-3">
      {error ? <Alert>{error}</Alert> : null}
      {list.data.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-600">
          No saved searches yet. Search, then tap “Save this search”.
        </p>
      ) : (
        <ul className="stagger space-y-3">
          {list.data.map((s) => {
            const query = new URLSearchParams(Object.entries(s.filters).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])).toString();
            return (
              <li key={s.id} className="lift space-y-3 rounded-lg border border-slate-200 bg-panel shadow-sm p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`${resultsPath}${query ? `?${query}` : ''}`} className="font-semibold text-emerald-800 underline">
                    {s.name}
                  </Link>
                  <button
                    type="button"
                    className="text-sm text-slate-700 underline"
                    onClick={() => window.confirm(`Delete “${s.name}”?`) && void run(() => authed(`/saved-searches/${s.id}`, { method: 'DELETE' }))}
                  >
                    Delete
                  </button>
                </div>
                <p className="text-sm text-slate-600">
                  {Object.entries(s.filters)
                    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                    .join(' · ') || 'All'}
                </p>
                <Select
                  label="Alerts"
                  id={`freq-${s.id}`}
                  value={s.alertFrequency}
                  onChange={(e) => void run(() => authed(`/saved-searches/${s.id}`, { method: 'PATCH', body: { alertFrequency: e.target.value } }))}
                  options={ALERT_FREQUENCIES.map((f) => ({ value: f, label: ALERT_FREQUENCY_LABELS[f] }))}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
