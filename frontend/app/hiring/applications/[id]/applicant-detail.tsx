'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  APPLICATION_STATUS_LABELS,
  canMove,
  FINAL_STATUSES,
  POSTER_STATUSES,
  type ApplicantDetailResponse,
  type CvLinkResponse,
  type MoveStatusResponse,
} from '@edu-forum/shared';
import { Checkbox, Select, TextArea } from '@/components/form';
import { ApplicantInterviews } from '@/components/schedule-interview';
import { StatusBadge } from '@/components/status-badge';
import { Alert, Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { shortDate } from '@/lib/format';
import { nameBySlug, useSubjects } from '@/lib/meta';

/** One applicant, for the vacancy's poster. Opening it marks the application "viewed". */
export function ApplicantDetail({ id }: { id: string }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const subjectName = nameBySlug(useSubjects().data);
  const key = ['applications', id];
  const app = useQuery({ queryKey: key, queryFn: () => authed<ApplicantDetailResponse>(`/applications/${id}`), staleTime: 0 });
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [closeVacancy, setCloseVacancy] = useState(true);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setNotice(null);
    try {
      await fn();
      await refresh();
      if (ok) setNotice({ kind: 'success', text: ok });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong. Try again.' });
    }
  }

  async function openCv(download: boolean) {
    const tab = download ? null : window.open('', '_blank');
    try {
      const link = await authed<CvLinkResponse>(`/applications/${id}/cv${download ? '?download=true' : ''}`);
      if (tab) tab.location.href = link.url;
      else window.location.href = link.url;
    } catch (err) {
      tab?.close();
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not open the CV.' });
    }
  }

  if (app.isPending) return <p className="px-4 py-10 text-center text-slate-500">Loading…</p>;
  if (app.isError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Alert>This application is not available.</Alert>
      </main>
    );
  }
  const a = app.data;
  const t = a.teacher;
  const moves = POSTER_STATUSES.filter((s) => canMove(a.status, s));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <Link href={`/hiring/vacancies/${a.vacancy.id}/applicants`} className="text-sm text-emerald-800 underline">
        ← All applicants for {a.vacancy.title}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.fullName}</h1>
          <p className="text-slate-600">
            {a.matchScore}% match · {[t.lga?.name, t.state?.name].filter(Boolean).join(', ')} · applied {shortDate(a.appliedAt)}
          </p>
          <Link href={`/hiring/teachers/${t.id}`} className="text-sm font-semibold text-emerald-800 underline">
            Full profile
          </Link>
        </div>
        <StatusBadge status={a.status} />
      </header>

      {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}

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
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">CV as sent</h2>
        <p className="text-slate-700">
          {a.cv.fileName} · {a.cv.mimeType.toUpperCase()}
        </p>
        <div className="flex gap-4 font-semibold">
          <button type="button" onClick={() => void openCv(false)} className="text-emerald-800 underline">
            View CV
          </button>
          <button type="button" onClick={() => void openCv(true)} className="text-emerald-800 underline">
            Download
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Application</h2>
        <p className="text-slate-700">
          {t.subjects.map(subjectName).join(', ')} · {t.noExperienceYet ? 'New graduate' : `${t.yearsExperience} years`}
          {t.highestQualification ? ` · ${t.highestQualification}` : ''}
        </p>
        {a.coverNote ? <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-slate-800">{a.coverNote}</p> : null}
        {a.screeningAnswers.map((s) => (
          <div key={s.questionId}>
            <p className="text-sm font-medium text-slate-800">{s.question}</p>
            <p className="text-slate-700">{s.answer === 'yes' ? 'Yes' : s.answer === 'no' ? 'No' : s.answer}</p>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Your rating (private)</h2>
        <div className="flex gap-1" role="group" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              aria-pressed={a.rating === n}
              onClick={() => void run(() => authed(`/applications/${id}/rating`, { method: 'PATCH', body: { rating: a.rating === n ? null : n } }))}
              className={`text-2xl ${a.rating && n <= a.rating ? 'text-amber-500' : 'text-slate-300'}`}
            >
              ★
            </button>
          ))}
        </div>
      </section>

      {moves.length ? (
        <section className="space-y-3 rounded-lg border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-900">Move this applicant</h2>
          <Select
            label="New status"
            name="to"
            placeholder="Choose…"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            options={moves.map((s) => ({ value: s, label: APPLICATION_STATUS_LABELS[s] }))}
          />
          <TextArea label="Message to the teacher (optional)" id="message" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
          {to === 'hired' ? <Checkbox name="closeVacancy" label="Close this vacancy as filled" checked={closeVacancy} onChange={(e) => setCloseVacancy(e.target.checked)} /> : null}
          <Button
            type="button"
            disabled={!to}
            onClick={() =>
              void run(async () => {
                const res = await authed<MoveStatusResponse>(`/applications/${id}/status`, {
                  method: 'PATCH',
                  body: { status: to, message, closeVacancy: to === 'hired' && closeVacancy },
                });
                setTo('');
                setMessage('');
                if (res.vacancyClosed) void qc.invalidateQueries({ queryKey: ['vacancies', 'mine'] });
              }, 'Status updated. The teacher has been emailed.')
            }
          >
            Update status
          </Button>
        </section>
      ) : null}

      <ApplicantInterviews applicationId={id} closed={FINAL_STATUSES.includes(a.status)} onScheduled={() => void refresh()} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Private notes</h2>
        <p className="text-sm text-slate-500">Only you can see these. The teacher never does.</p>
        <ul className="space-y-2">
          {a.notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-slate-50 p-3">
              <p className="whitespace-pre-line text-slate-800">{n.body}</p>
              <p className="mt-1 flex justify-between text-xs text-slate-500">
                {shortDate(n.at)}
                {n.mine ? (
                  <button type="button" className="font-semibold text-red-700 underline" onClick={() => void run(() => authed(`/applications/${id}/notes/${n.id}`, { method: 'DELETE' }))}>
                    Delete
                  </button>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
        <TextArea label="Add a note" id="note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        <button
          type="button"
          disabled={!note.trim()}
          onClick={() =>
            void run(async () => {
              await authed(`/applications/${id}/notes`, { method: 'POST', body: { body: note } });
              setNote('');
            })
          }
          className="font-semibold text-emerald-800 underline disabled:opacity-50"
        >
          Save note
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">History</h2>
        <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
          {a.history.map((h) => (
            <li key={h.id} className="text-sm">
              <span className="font-semibold text-slate-800">{APPLICATION_STATUS_LABELS[h.toStatus]}</span>{' '}
              <span className="text-slate-500">
                {shortDate(h.at)} · {h.by}
              </span>
              {h.message ? <p className="text-slate-700">“{h.message}”</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
