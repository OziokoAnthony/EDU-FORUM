import Link from 'next/link';
import { CALENDAR_KIND_LABELS, MATERIAL_KIND_LABELS, TERM_LABELS, type CalendarEventItem, type MaterialItem } from '@edu-forum/shared';

export const fileSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const dateFmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', ...opts });
export const longDate = (iso: string) => dateFmt(iso, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

/** "Mon 12 Jan" or "Mon 12 – Fri 16 Jan 2027". */
export function dateRange(start: string, end: string | null): string {
  if (!end || end === start) return longDate(start);
  return `${dateFmt(start, { weekday: 'short', day: 'numeric', month: 'short' })} – ${longDate(end)}`;
}

/** A teaching material in a list. */
export function MaterialCard({ m }: { m: MaterialItem }) {
  return (
    <li className="lift rounded-lg bg-panel p-4 shadow-sm">
      <Link href={m.path} className="block space-y-1">
        <p className="text-xs font-semibold uppercase text-brand">{MATERIAL_KIND_LABELS[m.kind]}</p>
        <h2 className="text-lg leading-snug text-slate-900">{m.title}</h2>
        <p className="line-clamp-2 text-sm text-slate-600">{m.description}</p>
        <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
          {m.subject ? <span>{m.subject.name}</span> : null}
          {m.classLevel ? <span>{m.classLevel.name}</span> : null}
          {m.term ? <span>{TERM_LABELS[m.term]}</span> : null}
          <span>
            {m.fileType} · {fileSize(m.sizeBytes)}
          </span>
          <span>{m.downloads} downloads</span>
        </p>
      </Link>
    </li>
  );
}

/** One calendar date, with its kind and (if any) its state. */
export function CalendarRow({ e }: { e: CalendarEventItem }) {
  return (
    <li className="flex gap-3 py-2">
      <span className="flex w-14 shrink-0 flex-col items-center rounded-md bg-brand/10 py-1 text-brand">
        <span className="text-[11px] font-semibold uppercase">{dateFmt(e.startDate, { month: 'short' })}</span>
        <span className="text-xl font-bold leading-none">{dateFmt(e.startDate, { day: 'numeric' })}</span>
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-slate-900">{e.title}</span>
        <span className="block text-sm text-slate-600">
          {CALENDAR_KIND_LABELS[e.kind]} · {dateRange(e.startDate, e.endDate)} · {e.state ? e.state.name : 'All Nigeria'}
        </span>
        {e.note ? <span className="block text-sm text-slate-500">{e.note}</span> : null}
      </span>
    </li>
  );
}
