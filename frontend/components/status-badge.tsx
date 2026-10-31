import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@edu-forum/shared';

const STYLE: Record<ApplicationStatus, string> = {
  applied: 'bg-slate-100 text-slate-700',
  viewed: 'bg-sky-100 text-sky-800',
  shortlisted: 'bg-emerald-100 text-emerald-800',
  interview: 'bg-violet-100 text-violet-800',
  offered: 'bg-amber-100 text-amber-800',
  hired: 'bg-emerald-700 text-white',
  rejected: 'bg-slate-200 text-slate-600',
  withdrawn: 'bg-slate-200 text-slate-600',
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STYLE[status]}`}>{APPLICATION_STATUS_LABELS[status]}</span>;
}
