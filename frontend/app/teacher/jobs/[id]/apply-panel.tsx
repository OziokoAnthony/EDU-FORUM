'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import type { MyApplicationResponse, Paginated, VacancyResponse } from '@edu-forum/shared';
import { TextArea } from '@/components/form';
import { StatusBadge } from '@/components/status-badge';
import { Alert, Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMyProfile } from '@/lib/teacher';

export const MY_APPLICATIONS_KEY = ['applications', 'mine'];

/** Apply with the current CV, a cover note and the screening answers (FR-7.1). */
export function ApplyPanel({ v }: { v: VacancyResponse }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const profile = useMyProfile();
  const mine = useQuery({
    queryKey: MY_APPLICATIONS_KEY,
    queryFn: () => authed<Paginated<MyApplicationResponse>>('/applications/me?limit=50'),
  });
  const [coverNote, setCoverNote] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const existing = mine.data?.data.find((a) => a.vacancy.id === v.id);
  if (existing) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
        <p className="text-slate-700">
          You applied on {new Date(existing.appliedAt).toLocaleDateString('en-NG')}. Status: <StatusBadge status={existing.status} />
        </p>
        <Link href="/teacher/applications" className="font-semibold text-emerald-800 underline">
          My applications
        </Link>
      </section>
    );
  }
  if (v.status !== 'published') return null;
  if (profile.data && !profile.data.isPublished) {
    return (
      <Alert kind="info">
        Publish your profile to apply.{' '}
        <Link href="/teacher" className="font-semibold underline">
          Finish your profile
        </Link>
      </Alert>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const missing = Object.fromEntries(v.screeningQuestions.filter((q) => !answers[q.id]?.trim()).map((q) => [q.id, 'Answer this question']));
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setBusy(true);
    try {
      await authed(`/vacancies/${v.id}/applications`, {
        method: 'POST',
        body: { coverNote, screeningAnswers: v.screeningQuestions.map((q) => ({ questionId: q.id, answer: answers[q.id] })) },
      });
      await qc.invalidateQueries({ queryKey: MY_APPLICATIONS_KEY });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not send your application. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-lg border border-emerald-200 p-4">
      <h2 className="text-lg font-semibold text-slate-900">Apply for this job</h2>
      <p className="text-sm text-slate-600">
        Your profile and current CV{profile.data?.cv ? ` (${profile.data.cv.fileName})` : ''} are sent. Updating your CV later does not change this application.
      </p>
      {v.screeningQuestions.map((q) => (
        <fieldset key={q.id} className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">{q.question}</legend>
          {q.type === 'yes_no' ? (
            <div className="flex gap-6">
              {['yes', 'no'].map((opt) => (
                <label key={opt} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                    className="h-5 w-5 accent-emerald-700"
                  />
                  {opt === 'yes' ? 'Yes' : 'No'}
                </label>
              ))}
            </div>
          ) : (
            <TextArea
              label="Your answer"
              id={`q-${q.id}`}
              rows={3}
              maxLength={1000}
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            />
          )}
          {errors[q.id] ? <p className="text-sm text-red-600">{errors[q.id]}</p> : null}
        </fieldset>
      ))}
      <TextArea label="Cover note (optional)" id="coverNote" maxLength={2000} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} />
      {formError ? <Alert>{formError}</Alert> : null}
      <Button type="submit" loading={busy}>
        Send application
      </Button>
    </form>
  );
}
