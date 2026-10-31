'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { EXPERIENCE_KIND_LABELS, GENDER_LABELS, JOB_TYPE_LABELS, type CvLinkResponse, type TeacherViewResponse } from '@edu-forum/shared';
import { InvitePanel } from '@/components/invite-panel';
import { ReportButton } from '@/components/report-button';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, shortDate } from '@/lib/format';
import { nameBySlug, useLevels, useStates, useSubjects } from '@/lib/meta';

/**
 * A teacher's profile for principals and directors: contact details are always shown
 * (user, 2026-10-31); never the street address or map pin. Opening it is logged.
 */
export function TeacherProfile({ id }: { id: string }) {
  const { authed } = useAuth();
  const subjectName = nameBySlug(useSubjects().data);
  const levelName = nameBySlug(useLevels().data);
  const stateName = nameBySlug(useStates().data);
  const [cvError, setCvError] = useState<string | null>(null);
  const profile = useQuery({ queryKey: ['teachers', id], queryFn: () => authed<TeacherViewResponse>(`/teachers/${id}`), staleTime: 0 });

  async function openCv(download: boolean) {
    setCvError(null);
    // Open the tab first (popup blockers), then point it at the 10-minute signed link.
    const tab = download ? null : window.open('', '_blank');
    try {
      const link = await authed<CvLinkResponse>(`/teachers/${id}/cv${download ? '?download=true' : ''}`);
      if (tab) tab.location.href = link.url;
      else window.location.href = link.url;
    } catch (err) {
      tab?.close();
      setCvError(err instanceof ApiError ? err.message : 'Could not open the CV. Try again.');
    }
  }

  if (profile.isPending) return <p className="px-4 py-10 text-center text-slate-500">Loading…</p>;
  if (profile.isError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Alert>This teacher profile is not available.</Alert>
      </main>
    );
  }
  const t = profile.data;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <Link href="/hiring/teachers" className="text-sm text-emerald-800 underline">
        ← Back to search
      </Link>

      <header className="flex gap-4">
        {t.photoUrl ? (
          // Signed, short-lived URL from private storage: next/image cannot optimise it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.photoUrl} alt={`Photo of ${t.fullName}`} width={80} height={80} className="h-20 w-20 rounded-full object-cover" />
        ) : null}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.fullName}</h1>
          <p className="text-slate-600">
            {[t.lga?.name, t.state?.name].filter(Boolean).join(', ')}
            {t.gender && t.gender !== 'prefer_not_to_say' ? ` · ${GENDER_LABELS[t.gender]}` : ''}
          </p>
          <p className="text-slate-600">
            {t.noExperienceYet ? 'New graduate' : `${t.yearsExperience} years of experience`}
            {t.highestQualification ? ` · ${t.highestQualification}` : ''}
          </p>
        </div>
      </header>

      <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <h2 className="font-semibold text-slate-900">Contact</h2>
        {t.phone ? (
          <p>
            Phone:{' '}
            <a href={`tel:${t.phone}`} className="font-semibold text-emerald-800 underline">
              {t.phone}
            </a>
          </p>
        ) : null}
        {t.email ? (
          <p className="break-all">
            Email:{' '}
            <a href={`mailto:${t.email}`} className="font-semibold text-emerald-800 underline">
              {t.email}
            </a>
          </p>
        ) : null}
        <p className="text-sm text-slate-600">Chat with teachers arrives with messaging.</p>
      </section>

      <InvitePanel teacherId={t.id} teacherName={t.fullName ?? 'this teacher'} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">CV</h2>
        {t.cv ? (
          <>
            <p className="text-slate-700">
              {t.cv.fileName} · {t.cv.mimeType.toUpperCase()} · uploaded {shortDate(t.cv.uploadedAt)}
            </p>
            <div className="flex gap-4 font-semibold">
              <button type="button" onClick={() => void openCv(false)} className="text-emerald-800 underline">
                View CV
              </button>
              <button type="button" onClick={() => void openCv(true)} className="text-emerald-800 underline">
                Download
              </button>
            </div>
          </>
        ) : (
          <p className="text-slate-600">No CV available.</p>
        )}
        {cvError ? <Alert>{cvError}</Alert> : null}
      </section>

      {t.bio ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">About</h2>
          <p className="whitespace-pre-line text-slate-700">{t.bio}</p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Teaching preferences</h2>
        <p className="text-slate-700">Subjects: {t.subjects.map(subjectName).join(', ')}</p>
        <p className="text-slate-700">Levels: {t.levels.map(levelName).join(', ')}</p>
        <p className="text-slate-700">Job type: {t.jobTypes.map((j) => JOB_TYPE_LABELS[j]).join(', ')}</p>
        {t.expectedSalaryMin || t.expectedSalaryMax ? (
          <p className="text-slate-700">
            Expected salary: {t.expectedSalaryMin ? money(t.expectedSalaryMin) : '—'} to {t.expectedSalaryMax ? money(t.expectedSalaryMax) : '—'} per month
          </p>
        ) : null}
        {t.availableFrom ? <p className="text-slate-700">Available from {shortDate(t.availableFrom)}</p> : null}
        {t.willingToRelocate ? (
          <p className="text-slate-700">
            Willing to relocate{t.preferredStates.length ? ` to ${t.preferredStates.map(stateName).join(', ')}` : ''}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Qualifications</h2>
        <ul className="space-y-1">
          {t.qualifications.map((q) => (
            <li key={q.id} className="text-slate-700">
              {q.type} {q.course}, {q.institution} ({q.yearObtained})
            </li>
          ))}
        </ul>
      </section>

      {t.certificationDetails.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Certifications</h2>
          <ul className="space-y-1">
            {t.certificationDetails.map((c) => (
              <li key={c.id} className="text-slate-700">
                {c.type}: {c.issuer}, No. {c.number}
                {c.expiresAt ? ` (expires ${shortDate(c.expiresAt)})` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ReportButton targetType="teacher_profile" targetId={t.id} label="Report this profile" />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Experience</h2>
        <ul className="space-y-3">
          {t.experiences.map((e) => (
            <li key={e.id}>
              <p className="font-semibold text-slate-900">
                {e.role}, {e.schoolName}
              </p>
              <p className="text-sm text-slate-600">
                {EXPERIENCE_KIND_LABELS[e.kind]} · {shortDate(e.startDate)} to {e.isCurrent || !e.endDate ? 'now' : shortDate(e.endDate)}
              </p>
              {e.description ? <p className="whitespace-pre-line text-slate-700">{e.description}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
