import Link from 'next/link';
import { JOB_TYPE_LABELS, SCHOOL_TYPE_LABELS, type VacancyListItem } from '@edu-forum/shared';
import { salaryRange, shortDate } from '@/lib/format';

/** A vacancy in search results. Anonymous ones show "Confidential school" and no distance. */
export function VacancyCard({ v, href }: { v: VacancyListItem; href: string }) {
  return (
    <li className="lift rounded-lg border border-slate-200 bg-white p-4">
      <Link href={href} className="block space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold text-emerald-900 underline">{v.title}</p>
          {v.matchScore != null ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">{v.matchScore}% match</span>
          ) : null}
        </div>
        <p className="text-sm text-slate-700">
          {v.schoolLabel}
          {v.isAnonymous && v.schoolType ? ` · ${SCHOOL_TYPE_LABELS[v.schoolType]}` : ''}
        </p>
        <p className="text-sm text-slate-600">
          {v.lga.name}, {v.state.name}
          {v.distanceKm != null ? ` · ${v.distanceKm} km away` : ''}
        </p>
        <p className="text-sm font-semibold text-slate-800">{salaryRange(v.salaryMin, v.salaryMax, v.salaryPeriod)}</p>
        <p className="text-sm text-slate-600">
          {JOB_TYPE_LABELS[v.jobType]} · posted {shortDate(v.publishedAt)}
          {v.deadline ? ` · apply by ${shortDate(v.deadline)}` : ''}
        </p>
        <p className="text-sm text-slate-500">{v.excerpt}</p>
      </Link>
    </li>
  );
}
