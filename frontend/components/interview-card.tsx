'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ACTIVE_INTERVIEW_STATUSES, INTERVIEW_MODE_LABELS, INTERVIEW_STATUS_LABELS, type InterviewItem } from '@edu-forum/shared';
import { Field } from '@/components/ui';
import { SecondaryButton } from '@/components/form';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export const INTERVIEWS_KEY = ['interviews'] as const;

/** Nigeria is on WAT all year, so times show in Lagos time whatever the device says. */
export const lagosTime = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** `<input type="datetime-local">` value → ISO with offset (the browser's own time zone). */
export const localToIso = (value: string) => new Date(value).toISOString();

const STATUS_STYLE: Record<InterviewItem['status'], string> = {
  proposed: 'bg-amber-100 text-amber-800',
  rescheduled: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-200 text-slate-600',
  done: 'bg-slate-200 text-slate-600',
};

/** One interview with the actions the viewer may take (teacher or poster). */
export function InterviewCard({ iv, as }: { iv: InterviewItem; as: 'teacher' | 'poster' }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'none' | 'time' | 'cancel'>('none');
  const [time, setTime] = useState('');
  const [text, setText] = useState('');
  const active = ACTIVE_INTERVIEW_STATUSES.includes(iv.status);
  const started = new Date(iv.scheduledAt).getTime() <= Date.now();

  async function run(path: string, method: 'POST' | 'PATCH', body: unknown = {}) {
    setError(null);
    setBusy(true);
    try {
      await authed(path, { method, body });
      setPanel('none');
      setTime('');
      setText('');
      await qc.invalidateQueries({ queryKey: INTERVIEWS_KEY });
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fieldErrors())[0] ?? err.message) : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const isLink = /^https?:\/\//i.test(iv.locationOrLink);

  return (
    <li className="lift space-y-3 rounded-md border border-slate-200 bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{lagosTime(iv.scheduledAt)}</p>
          <p className="text-sm text-slate-600">
            {as === 'poster' ? (
              <Link href={`/hiring/applications/${iv.applicationId}`} className="text-emerald-800 underline">
                {iv.teacher.fullName ?? 'Teacher'}
              </Link>
            ) : (
              iv.vacancy.schoolLabel
            )}{' '}
            · {iv.vacancy.title}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[iv.status]}`}>{INTERVIEW_STATUS_LABELS[iv.status]}</span>
      </div>
      <p className="text-slate-700">
        {INTERVIEW_MODE_LABELS[iv.mode]}
        {iv.durationMinutes ? ` · ${iv.durationMinutes} min` : ''}:{' '}
        {isLink ? (
          <a href={iv.locationOrLink} target="_blank" rel="noopener noreferrer" className="break-all text-emerald-800 underline">
            {iv.locationOrLink}
          </a>
        ) : iv.mode === 'phone' ? (
          <a href={`tel:${iv.locationOrLink}`} className="text-emerald-800 underline">
            {iv.locationOrLink}
          </a>
        ) : (
          iv.locationOrLink
        )}
      </p>
      {iv.notes ? <p className="text-sm text-slate-600">Notes: {iv.notes}</p> : null}
      {iv.proposedAt && active ? (
        <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
          {as === 'poster' ? 'The teacher suggested' : 'You suggested'} {lagosTime(iv.proposedAt)}
          {iv.proposalNote ? ` (“${iv.proposalNote}”)` : ''}.
        </p>
      ) : null}
      {iv.cancelReason ? <p className="text-sm text-slate-600">Reason for cancelling: {iv.cancelReason}</p> : null}
      {error ? <Alert>{error}</Alert> : null}

      {active ? (
        <div className="flex flex-wrap gap-2">
          {as === 'teacher' && iv.status !== 'confirmed' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(`/interviews/${iv.id}/confirm`, 'POST')}
              className="rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              Confirm
            </button>
          ) : null}
          {as === 'poster' && iv.proposedAt ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(`/interviews/${iv.id}`, 'PATCH', { scheduledAt: iv.proposedAt })}
              className="rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              Use suggested time
            </button>
          ) : null}
          <SecondaryButton disabled={busy} onClick={() => setPanel(panel === 'time' ? 'none' : 'time')}>
            {as === 'teacher' ? 'Suggest another time' : 'Change time'}
          </SecondaryButton>
          <SecondaryButton disabled={busy} onClick={() => setPanel(panel === 'cancel' ? 'none' : 'cancel')}>
            Cancel interview
          </SecondaryButton>
          {as === 'poster' && started ? (
            <SecondaryButton disabled={busy} onClick={() => void run(`/interviews/${iv.id}/complete`, 'POST')}>
              Mark as done
            </SecondaryButton>
          ) : null}
        </div>
      ) : null}

      {panel === 'time' ? (
        <form
          className="space-y-3 rounded-md border border-slate-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!time) return setError('Pick a date and time');
            void (as === 'teacher'
              ? run(`/interviews/${iv.id}/propose`, 'POST', { proposedAt: localToIso(time), note: text })
              : run(`/interviews/${iv.id}`, 'PATCH', { scheduledAt: localToIso(time) }));
          }}
        >
          <Field label={as === 'teacher' ? 'Time that suits you' : 'New date and time'} id={`time-${iv.id}`} type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
          {as === 'teacher' ? <Field label="Note (optional)" id={`note-${iv.id}`} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} /> : null}
          <SecondaryButton type="submit" disabled={busy}>
            {as === 'teacher' ? 'Send suggestion' : 'Save new time'}
          </SecondaryButton>
        </form>
      ) : null}
      {panel === 'cancel' ? (
        <form
          className="space-y-3 rounded-md border border-slate-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(`/interviews/${iv.id}/cancel`, 'POST', { reason: text });
          }}
        >
          <Field label="Reason (optional)" id={`reason-${iv.id}`} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
          <SecondaryButton type="submit" disabled={busy}>
            Yes, cancel it
          </SecondaryButton>
        </form>
      ) : null}
    </li>
  );
}
