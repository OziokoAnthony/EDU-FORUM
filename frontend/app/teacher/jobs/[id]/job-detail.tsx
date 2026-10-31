'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { BENEFIT_LABELS, JOB_TYPE_LABELS, SCHOOL_TYPE_LABELS, type VacancyResponse } from '@edu-forum/shared';
import { Alert } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { salaryRange, shortDate } from '@/lib/format';
import { nameBySlug, useCertificationTypes, useLevels, useQualificationTypes, useSubjects } from '@/lib/meta';

/**
 * A job, as a signed-in teacher sees it. The public, search-engine version of this page is
 * built in the SEO phase. The description is HTML already cleaned by the API.
 */
export function JobDetail({ id }: { id: string }) {
  const { authed } = useAuth();
  const subjectName = nameBySlug(useSubjects().data);
  const levelName = nameBySlug(useLevels().data);
  const qualName = nameBySlug(useQualificationTypes().data);
  const certName = nameBySlug(useCertificationTypes().data);
  const job = useQuery({ queryKey: ['vacancies', id], queryFn: () => authed<VacancyResponse>(`/vacancies/${id}`) });

  if (job.isPending) return <p className="px-4 py-10 text-center text-slate-500">Loading…</p>;
  if (job.isError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Alert>This job is no longer available.</Alert>
      </main>
    );
  }
  const v = job.data;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link href="/teacher/jobs" className="text-sm text-emerald-800 underline">
        ← Back to jobs
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">{v.title}</h1>
        <p className="text-slate-700">
          {v.schoolLabel}
          {v.schoolType ? ` · ${SCHOOL_TYPE_LABELS[v.schoolType]}` : ''}
        </p>
        <p className="text-slate-600">
          {[v.location.area, v.location.lga.name, v.location.state.name].filter(Boolean).join(', ')}
        </p>
        <p className="text-lg font-semibold text-slate-900">{salaryRange(v.salaryMin, v.salaryMax, v.salaryPeriod)}</p>
        <p className="text-sm text-slate-600">
          {JOB_TYPE_LABELS[v.jobType]} · {v.openings} opening{v.openings === 1 ? '' : 's'} · posted by the {v.postedBy.toLowerCase()}
          {v.deadline ? ` · apply by ${shortDate(v.deadline)}` : ''}
        </p>
      </header>

      {v.status === 'closed' ? <Alert kind="info">This position is closed.</Alert> : null}
      {v.isAnonymous && !v.revealed ? (
        <Alert kind="info">The school&apos;s name and address are shown once you are shortlisted or invited.</Alert>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">About the job</h2>
        <div
          className="space-y-2 text-slate-800 [&_a]:text-emerald-800 [&_a]:underline [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
          // Sanitised server-side (sanitize-html allow-list) before it is stored.
          dangerouslySetInnerHTML={{ __html: v.description }}
        />
      </section>

      <section className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">Requirements</h2>
        <p className="text-slate-700">Subjects: {v.subjects.map(subjectName).join(', ')}</p>
        <p className="text-slate-700">Levels: {v.levels.map(levelName).join(', ')}</p>
        {v.requiredQualifications.length ? <p className="text-slate-700">Qualifications: {v.requiredQualifications.map(qualName).join(', ')}</p> : null}
        {v.minExperienceYears ? <p className="text-slate-700">At least {v.minExperienceYears} years of experience</p> : null}
        {v.requiredCertifications.length ? <p className="text-slate-700">Certifications: {v.requiredCertifications.map(certName).join(', ')}</p> : null}
        {v.startDate ? <p className="text-slate-700">Starts {shortDate(v.startDate)}</p> : null}
      </section>

      {v.benefits.length ? (
        <section className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">Benefits</h2>
          <p className="text-slate-700">{v.benefits.map((b) => BENEFIT_LABELS[b]).join(', ')}</p>
        </section>
      ) : null}

      <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-700">Applying with your CV arrives in the next phase.</p>
    </main>
  );
}
