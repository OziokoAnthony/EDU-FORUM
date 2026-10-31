'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  POSTER_STATUSES,
  type ApplicantResponse,
  type ApplicationStatus,
  type BulkStatusResponse,
  type Paginated,
} from '@edu-forum/shared';
import { Select } from '@/components/form';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { shortDate } from '@/lib/format';
import { useMyVacancy } from '@/lib/vacancies';

export const applicantsKey = (id: string) => ['vacancies', id, 'applicants'];

/** FR-7.4: a vacancy's applicants, filters, bulk moves and CSV export. Poster only. */
export function Applicants({ id }: { id: string }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const vacancy = useMyVacancy(id);
  const [status, setStatus] = useState<ApplicationStatus | undefined>(undefined);
  const [sort, setSort] = useState('match');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkTo, setBulkTo] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const list = useQuery({
    queryKey: [...applicantsKey(id), status ?? 'all', sort],
    queryFn: () => authed<Paginated<ApplicantResponse>>(`/vacancies/${id}/applications?limit=50&sort=${sort}${status ? `&status=${status}` : ''}`),
    staleTime: 0,
  });
  const rows = list.data?.data ?? [];

  async function bulk() {
    if (!bulkTo || selected.length === 0) return;
    setNotice(null);
    try {
      const res = await authed<BulkStatusResponse>(`/vacancies/${id}/applications/bulk-status`, {
        method: 'POST',
        body: { applicationIds: selected, status: bulkTo },
      });
      setNotice({
        kind: 'success',
        text: `Moved ${res.updated.length} to ${APPLICATION_STATUS_LABELS[bulkTo as ApplicationStatus]}.${res.skipped.length ? ` ${res.skipped.length} skipped (already further along or closed).` : ''}`,
      });
      setSelected([]);
      await qc.invalidateQueries({ queryKey: applicantsKey(id) });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not move applicants.' });
    }
  }

  async function exportCsv() {
    setNotice(null);
    try {
      const csv = await authed<string>(`/vacancies/${id}/applications/export`, { responseType: 'text' });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: `applicants-${vacancy.data?.slug ?? id}.csv` });
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not export.' });
    }
  }

  const toggle = (appId: string) => setSelected((s) => (s.includes(appId) ? s.filter((x) => x !== appId) : [...s, appId]));

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link href="/hiring" className="text-sm text-emerald-800 underline">
        ← Back to vacancies
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Applicants</h1>
          {vacancy.data ? <p className="text-slate-600">{vacancy.data.title}</p> : null}
        </div>
        <button type="button" onClick={() => void exportCsv()} className="font-semibold text-emerald-800 underline">
          Export CSV
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter by status">
        {[undefined, ...APPLICATION_STATUSES].map((s) => (
          <button
            key={s ?? 'all'}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => {
              setStatus(s);
              setSelected([]);
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${status === s ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {s ? APPLICATION_STATUS_LABELS[s] : 'All'}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Sort by"
          name="sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          options={[
            { value: 'match', label: 'Best match' },
            { value: 'newest', label: 'Newest' },
            { value: 'rating', label: 'Your rating' },
          ]}
        />
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              label={`Move ${selected.length} selected to`}
              name="bulkTo"
              placeholder="Choose…"
              value={bulkTo}
              onChange={(e) => setBulkTo(e.target.value)}
              options={POSTER_STATUSES.map((s) => ({ value: s, label: APPLICATION_STATUS_LABELS[s] }))}
            />
          </div>
          <button
            type="button"
            disabled={!bulkTo || selected.length === 0}
            onClick={() => void bulk()}
            className="rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
          >
            Move
          </button>
        </div>
      </div>

      {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}

      {list.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : list.isError ? (
        <Alert>{list.error.message}</Alert>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">No applicants here yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <li key={a.id} className="flex gap-3 rounded-lg border border-slate-200 p-4">
              <input
                type="checkbox"
                aria-label={`Select ${a.teacher.fullName}`}
                checked={selected.includes(a.id)}
                onChange={() => toggle(a.id)}
                className="mt-1 h-5 w-5 shrink-0 accent-emerald-700"
              />
              <Link href={`/hiring/applications/${a.id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-emerald-900 underline">{a.teacher.fullName}</p>
                  <StatusBadge status={a.status} />
                </div>
                <p className="text-sm text-slate-600">
                  {a.matchScore}% match · {[a.teacher.lga?.name, a.teacher.state?.name].filter(Boolean).join(', ')}
                </p>
                <p className="text-sm text-slate-600">
                  {a.teacher.noExperienceYet ? 'New graduate' : `${a.teacher.yearsExperience} yrs`}
                  {a.teacher.highestQualification ? ` · ${a.teacher.highestQualification}` : ''}
                  {a.rating ? ` · ${'★'.repeat(a.rating)}` : ''}
                </p>
                <p className="text-sm text-slate-500">Applied {shortDate(a.appliedAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
