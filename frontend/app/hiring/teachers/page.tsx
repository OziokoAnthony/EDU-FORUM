'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Paginated, TeacherListItem } from '@edu-forum/shared';
import { Checkbox, SecondaryButton, Select } from '@/components/form';
import { SaveSearch, useFiltersFromUrl } from '@/components/saved';
import { TeacherCard } from '@/components/teacher-card';
import { Alert, Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useCertificationTypes, useLevels, useLgas, useQualificationTypes, useStates, useSubjects } from '@/lib/meta';
import { HiringNav } from '../hiring-nav';

type Filters = {
  q: string;
  subjects: string;
  levels: string;
  qualification: string;
  minExperience: string;
  certification: string;
  state: string;
  lga: string;
  willingToRelocate: boolean;
  sort: string;
};
const EMPTY: Filters = { q: '', subjects: '', levels: '', qualification: '', minExperience: '', certification: '', state: '', lga: '', willingToRelocate: false, sort: 'match' };

function toQuery(f: Filters, page: number): string {
  const p = new URLSearchParams({ page: String(page), limit: '20', sort: f.sort });
  for (const k of ['q', 'subjects', 'levels', 'qualification', 'minExperience', 'certification', 'state', 'lga'] as const) if (f[k]) p.set(k, f[k]);
  if (f.willingToRelocate) p.set('willingToRelocate', 'true');
  return p.toString();
}

/** PRD FR-5 teacher search (principals and directors). */
export default function Page() {
  const { authed } = useAuth();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const subjects = useSubjects();
  const levels = useLevels();
  const quals = useQualificationTypes();
  const certs = useCertificationTypes();
  const states = useStates();
  const stateId = states.data?.find((s) => s.slug === draft.state)?.id;
  const lgas = useLgas(stateId);
  const results = useInfiniteQuery({
    queryKey: ['teachers', 'search', filters],
    queryFn: ({ pageParam }) => authed<Paginated<TeacherListItem>>(`/teachers?${toQuery(filters, pageParam)}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page * last.meta.limit < last.meta.total ? last.meta.page + 1 : undefined),
  });
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target instanceof HTMLInputElement && e.target.type === 'checkbox' ? e.target.checked : e.target.value, ...(k === 'state' ? { lga: '' } : {}) }));
  const opts = (items: { slug: string; name: string }[] | undefined) => (items ?? []).map((i) => ({ value: i.slug, label: i.name }));
  const total = results.data?.pages[0]?.meta.total ?? 0;
  useFiltersFromUrl<Filters>((v) => {
    const f = { ...EMPTY, ...v };
    setDraft(f);
    setFilters(f);
  });
  const items = results.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <HiringNav current="teachers" />
      <h1 className="text-2xl font-bold text-slate-900">Find teachers</h1>

      <form
        className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(draft);
        }}
      >
        <div className="sm:col-span-2">
          <Field label="Keyword" placeholder="Name or words in their bio" value={draft.q} onChange={set('q')} name="q" />
        </div>
        <Select label="Subject" name="subjects" placeholder="Any" options={opts(subjects.data)} value={draft.subjects} onChange={set('subjects')} />
        <Select label="Level" name="levels" placeholder="Any" options={opts(levels.data)} value={draft.levels} onChange={set('levels')} />
        <Select label="Qualification (or higher)" name="qualification" placeholder="Any" options={opts(quals.data)} value={draft.qualification} onChange={set('qualification')} />
        <Select label="Certification" name="certification" placeholder="Any" options={opts(certs.data)} value={draft.certification} onChange={set('certification')} />
        <Field label="Min. years of experience" name="minExperience" type="number" inputMode="numeric" value={draft.minExperience} onChange={set('minExperience')} />
        <Select
          label="Sort by"
          name="sort"
          options={[
            { value: 'match', label: 'Best match' },
            { value: 'experience', label: 'Most experienced' },
            { value: 'updated', label: 'Recently updated' },
          ]}
          value={draft.sort}
          onChange={set('sort')}
        />
        <Select label="State" name="state" placeholder="Anywhere" options={opts(states.data)} value={draft.state} onChange={set('state')} />
        <Select label="LGA / city" name="lga" placeholder="Any" disabled={!draft.state} options={opts(lgas.data)} value={draft.lga} onChange={set('lga')} />
        <div className="sm:col-span-2">
          <Checkbox name="willingToRelocate" label="Include teachers willing to relocate to this state" checked={draft.willingToRelocate} onChange={set('willingToRelocate')} />
        </div>
        <div className="flex gap-3 sm:col-span-2">
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

      <SaveSearch filters={filters} savedHref="/hiring/saved" />
      {results.isPending ? (
        <p className="text-slate-500">Searching…</p>
      ) : results.isError ? (
        <Alert>{results.error.message}</Alert>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">No teachers match these filters yet.</p>
      ) : (
        <>
          <p className="text-sm text-slate-600" aria-live="polite">
            {total} teacher{total === 1 ? '' : 's'} found
          </p>
          <ul className="space-y-3">
            {items.map((t) => (
              <TeacherCard key={t.id} t={t} />
            ))}
          </ul>
          {results.hasNextPage ? (
            <SecondaryButton className="w-full" disabled={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>
              {results.isFetchingNextPage ? 'Loading…' : 'Show more'}
            </SecondaryButton>
          ) : null}
        </>
      )}
    </main>
  );
}
