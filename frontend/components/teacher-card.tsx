'use client';

import Link from 'next/link';
import { JOB_TYPE_LABELS, type TeacherListItem } from '@edu-forum/shared';
import { money } from '@/lib/format';
import { nameBySlug, useLevels, useSubjects } from '@/lib/meta';

/** A teacher in search results: no address or map pin, only state, LGA and distance. */
export function TeacherCard({ t, showMatch = true }: { t: TeacherListItem; showMatch?: boolean }) {
  const subjectName = nameBySlug(useSubjects().data);
  const levelName = nameBySlug(useLevels().data);
  return (
    <li className="lift rounded-lg border border-slate-200 bg-white p-4">
      <Link href={`/hiring/teachers/${t.id}`} className="flex gap-3">
        {t.photoUrl ? (
          // Signed, short-lived URL from private storage: next/image cannot optimise it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.photoUrl} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-full object-cover" />
        ) : (
          <div aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-500">
            {t.fullName.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold text-emerald-900 underline">{t.fullName}</p>
            {showMatch ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">{t.matchScore}% match</span> : null}
          </div>
          <p className="text-sm text-slate-600">
            {[t.lga?.name, t.state?.name].filter(Boolean).join(', ')}
            {t.distanceKm != null ? ` · ${t.distanceKm} km away` : ''}
            {t.willingToRelocate ? ' · willing to relocate' : ''}
          </p>
          <p className="text-sm text-slate-700">
            {t.subjects.map(subjectName).join(', ')} · {t.levels.map(levelName).join(', ')}
          </p>
          <p className="text-sm text-slate-600">
            {t.noExperienceYet ? 'New graduate' : `${t.yearsExperience} yrs experience`}
            {t.highestQualification ? ` · ${t.highestQualification}` : ''}
            {t.certifications.length ? ` · ${t.certifications.join(', ')}` : ''}
          </p>
          <p className="text-sm text-slate-500">
            {t.jobTypes.map((j) => JOB_TYPE_LABELS[j]).join(', ')}
            {t.expectedSalaryMin ? ` · expects from ${money(t.expectedSalaryMin)}` : ''}
          </p>
        </div>
      </Link>
    </li>
  );
}
