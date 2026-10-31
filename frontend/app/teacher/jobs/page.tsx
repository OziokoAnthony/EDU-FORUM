'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { JOB_TYPE_LABELS, JOB_TYPES, RADIUS_OPTIONS_KM, type Paginated, type VacancyListItem } from '@edu-forum/shared';
import { SecondaryButton, Select } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { VacancyCard } from '@/components/vacancy-card';
import { useAuth } from '@/lib/auth';
import { useLevels, useLgas, useStates, useSubjects } from '@/lib/meta';
import { useMyProfile } from '@/lib/teacher';

type Filters = { q: string; subjects: string; levels: string; jobType: string; state: string; lga: string; radiusKm: string; sort: string };
const EMPTY: Filters = { q: '', subjects: '', levels: '', jobType: '', state: '', lga: '', radiusKm: '', sort: 'relevance' };

function toQuery(f: Filters, page: number): string {
  const p = new URLSearchParams({ page: String(page), limit: '20', sort: f.sort });
  for (const k of ['q', 'subjects', 'levels', 'jobType', 'state', 'lga', 'radiusKm'] as const) if (f[k]) p.set(k, f[k]);
  return p.toString();
}

/** Teachers: job search (with match score from their profile) and recommended jobs. */
export default function Page() {
  const { authed } = useAuth();
  const profile = useMyProfile();
  const [tab, setTab] = useState<'recommended' | 'search'>('recommended');
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const subjects = useSubjects();
  const levels = useLevels();
  const states = useStates();
  const lgas = useLgas(states.data?.find((s) => s.slug === draft.state)?.id);
  const hasPin = profile.data?.location.lat != null;

  const recommended = useQuery({
    queryKey: ['vacancies', 'recommended'],
    queryFn: () => authed<Paginated<VacancyListItem>>('/vacancies/recommended'),
    enabled: tab === 'recommended',
  });
  const results = useInfiniteQuery({
    queryKey: ['vacancies', 'search', filters],
    queryFn: ({ pageParam }) => authed<Paginated<VacancyListItem>>(`/vacancies?${toQuery(filters, pageParam)}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page * last.meta.limit < last.meta.total ? last.meta.page + 1 : undefined),
    enabled: tab === 'search',
  });
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value, ...(k === 'state' ? { lga: '' } : {}) }));
  const opts = (items: { slug: string; name: string }[] | undefined) => (items ?? []).map((i) => ({ value: i.slug, label: i.name }));
  const items = results.data?.pages.flatMap((p) => p.data) ?? [];
  const total = results.data?.pages[0]?.meta.total ?? 0;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link href="/teacher" className="text-sm text-emerald-800 underline">
        ← Back to dashboard
      </Link>
      <h1 className="text-2xl font-bold text-slate-900">Find teaching jobs</h1>

      <div className="flex gap-2" role="tablist">
        {(['recommended', 'search'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {k === 'recommended' ? 'Recommended for you' : 'Search all jobs'}
          </button>
        ))}
      </div>

      {tab === 'recommended' ? (
        recommended.isPending ? (
          <p className="text-slate-500">Loading…</p>
        ) : recommended.isError ? (
          <Alert>{recommended.error.message}</Alert>
        ) : recommended.data.data.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
            No matching jobs yet. Add your subjects and levels in your profile, or search all jobs.
          </p>
        ) : (
          <ul className="space-y-3">
            {recommended.data.data.map((v) => (
              <VacancyCard key={v.id} v={v} href={`/teacher/jobs/${v.id}`} />
            ))}
          </ul>
        )
      ) : (
        <>
          <form
            className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setFilters(draft);
            }}
          >
            <div className="sm:col-span-2">
              <Field label="Keyword" name="q" placeholder="e.g. Physics, WAEC, Montessori" value={draft.q} onChange={set('q')} />
            </div>
            <Select label="Subject" name="subjects" placeholder="Any" options={opts(subjects.data)} value={draft.subjects} onChange={set('subjects')} />
            <Select label="Level" name="levels" placeholder="Any" options={opts(levels.data)} value={draft.levels} onChange={set('levels')} />
            <Select
              label="Job type"
              name="jobType"
              placeholder="Any"
              options={JOB_TYPES.map((j) => ({ value: j, label: JOB_TYPE_LABELS[j] }))}
              value={draft.jobType}
              onChange={set('jobType')}
            />
            <Select
              label="Distance from me"
              name="radiusKm"
              placeholder="Anywhere"
              disabled={!hasPin}
              hint={hasPin ? undefined : 'Add a map pin to your location to search by distance.'}
              options={RADIUS_OPTIONS_KM.map((r) => ({ value: String(r), label: `Within ${r} km` }))}
              value={draft.radiusKm}
              onChange={set('radiusKm')}
            />
            <Select label="State" name="state" placeholder="Any state" options={opts(states.data)} value={draft.state} onChange={set('state')} />
            <Select label="LGA / city" name="lga" placeholder="Any" disabled={!draft.state} options={opts(lgas.data)} value={draft.lga} onChange={set('lga')} />
            <Select
              label="Sort by"
              name="sort"
              options={[
                { value: 'relevance', label: 'Best match' },
                { value: 'distance', label: 'Nearest' },
                { value: 'newest', label: 'Newest' },
                { value: 'salary', label: 'Highest salary' },
              ]}
              value={draft.sort}
              onChange={set('sort')}
            />
            <div className="flex items-end gap-3">
              <Button type="submit">Search</Button>
              <SecondaryButton
                className="w-full"
                onClick={() => {
                  setDraft(EMPTY);
                  setFilters(EMPTY);
                }}
              >
                Clear
              </SecondaryButton>
            </div>
          </form>
          {results.isPending ? (
            <p className="text-slate-500">Searching…</p>
          ) : results.isError ? (
            <Alert>{results.error.message}</Alert>
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">No jobs match these filters.</p>
          ) : (
            <>
              <p className="text-sm text-slate-600" aria-live="polite">
                {total} job{total === 1 ? '' : 's'} found
              </p>
              <ul className="space-y-3">
                {items.map((v) => (
                  <VacancyCard key={v.id} v={v} href={`/teacher/jobs/${v.id}`} />
                ))}
              </ul>
              {results.hasNextPage ? (
                <SecondaryButton className="w-full" disabled={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>
                  {results.isFetchingNextPage ? 'Loading…' : 'Show more'}
                </SecondaryButton>
              ) : null}
            </>
          )}
        </>
      )}
    </main>
  );
}
