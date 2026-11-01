'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ACTIVE_INTERVIEW_STATUSES,
  INTERVIEW_MODE_LABELS,
  INTERVIEW_MODES,
  INTERVIEW_WHERE_LABELS,
  type InterviewItem,
  type InterviewMode,
} from '@edu-forum/shared';
import { Select, TextArea } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { INTERVIEWS_KEY, InterviewCard, localToIso } from './interview-card';

/** Applicant detail: this application's interviews, and the form to book one. */
export function ApplicantInterviews({ applicationId, closed, onScheduled }: { applicationId: string; closed: boolean; onScheduled?: () => void }) {
  const { authed } = useAuth();
  const list = useQuery({
    queryKey: [...INTERVIEWS_KEY, 'application', applicationId],
    queryFn: () => authed<InterviewItem[]>(`/applications/${applicationId}/interviews`),
    staleTime: 0,
  });
  const items = list.data ?? [];
  const hasActive = items.some((i) => ACTIVE_INTERVIEW_STATUSES.includes(i.status));

  return (
    <section className="space-y-3">
      <h2 className="text-xl text-slate-900">Interviews</h2>
      {items.length ? (
        <ul className="space-y-3">
          {items.map((iv) => (
            <InterviewCard key={iv.id} iv={iv} as="poster" />
          ))}
        </ul>
      ) : list.isPending ? null : (
        <p className="text-sm text-slate-600">No interview booked yet.</p>
      )}
      {!hasActive && !closed && !list.isPending ? <ScheduleForm applicationId={applicationId} onScheduled={onScheduled} /> : null}
    </section>
  );
}

function ScheduleForm({ applicationId, onScheduled }: { applicationId: string; onScheduled?: () => void }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState('30');
  const [mode, setMode] = useState<InterviewMode>('in_person');
  const [where, setWhere] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button type="button" className="sm:w-auto" onClick={() => setOpen(true)}>
        Schedule an interview
      </Button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!when) return setErrors({ scheduledAt: 'Pick a date and time' });
    setBusy(true);
    try {
      await authed(`/applications/${applicationId}/interviews`, {
        method: 'POST',
        body: { scheduledAt: localToIso(when), durationMinutes: duration ? Number(duration) : undefined, mode, locationOrLink: where, notes },
      });
      setOpen(false);
      setErrors({});
      await qc.invalidateQueries({ queryKey: INTERVIEWS_KEY });
      onScheduled?.();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        if (!Object.keys(err.fieldErrors()).length) setFormError(err.message);
      } else setFormError('Could not book the interview. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="animate-fade-up space-y-4 rounded-lg border border-slate-200 bg-panel shadow-sm p-4">
      <h3 className="text-lg text-slate-900">Schedule an interview</h3>
      <Field label="Date and time" id="iv-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} error={errors.scheduledAt} />
      <Select
        label="Length"
        id="iv-duration"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        options={['15', '30', '45', '60', '90', '120'].map((m) => ({ value: m, label: `${m} minutes` }))}
      />
      <Select
        label="How"
        id="iv-mode"
        value={mode}
        onChange={(e) => setMode(e.target.value as InterviewMode)}
        options={INTERVIEW_MODES.map((m) => ({ value: m, label: INTERVIEW_MODE_LABELS[m] }))}
      />
      <Field label={INTERVIEW_WHERE_LABELS[mode]} id="iv-where" maxLength={500} value={where} onChange={(e) => setWhere(e.target.value)} error={errors.locationOrLink} />
      <TextArea label="Notes for the teacher (optional)" id="iv-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} hint="e.g. bring your certificates, ask for the vice principal" />
      {formError ? <Alert>{formError}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} className="sm:w-auto">
          Send interview invitation
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 text-sm font-semibold text-slate-700 underline">
          Not now
        </button>
      </div>
    </form>
  );
}
