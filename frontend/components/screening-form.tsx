'use client';

import { useState } from 'react';
import type { ApplyInput, ScreeningQuestion } from '@edu-forum/shared';
import { TextArea } from '@/components/form';
import { Alert, Button } from '@/components/ui';
import { ApiError } from '@/lib/api';

/** Screening answers + cover note; used to apply and to accept an invitation (both apply). */
export function ScreeningForm({
  questions,
  submitLabel,
  onSubmit,
  children,
}: {
  questions: ScreeningQuestion[];
  submitLabel: string;
  onSubmit: (body: ApplyInput) => Promise<void>;
  children?: React.ReactNode;
}) {
  const [coverNote, setCoverNote] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const missing = Object.fromEntries(questions.filter((q) => !answers[q.id]?.trim()).map((q) => [q.id, 'Answer this question']));
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setBusy(true);
    try {
      await onSubmit({ coverNote, screeningAnswers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id] })) });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not send your application. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {children}
      {questions.map((q) => (
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
        {submitLabel}
      </Button>
    </form>
  );
}
