'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CompletenessKey, TeacherProfileResponse } from '@edu-forum/shared';
import { Alert, Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMyProfile, useRefreshTeacher } from '@/lib/teacher';
import { stepHref, type WizardStepKey } from './onboarding/wizard-steps';

/** Which wizard step fixes each completeness item. */
const STEP_FOR: Record<CompletenessKey, WizardStepKey> = {
  cv: 'cv',
  qualification: 'qualifications',
  experience: 'experience',
  preferences: 'preferences',
  location: 'location',
  personal: 'personal',
  photo: 'personal',
  bio: 'personal',
};

/** Teacher home: completeness, what is missing, publish/unpublish. Full dashboard stats come later. */
export function TeacherHome() {
  const { authed } = useAuth();
  const refresh = useRefreshTeacher();
  const profile = useMyProfile();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  if (profile.isPending) return <p className="px-4 py-10 text-center text-slate-500">Loading…</p>;
  if (profile.isError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Alert>Could not load your profile. Check your connection and refresh the page.</Alert>
      </main>
    );
  }

  const p = profile.data;
  const { completeness } = p;

  async function toggle(path: 'publish' | 'unpublish') {
    setBusy(true);
    setMessage(null);
    try {
      refresh(await authed<TeacherProfileResponse>(`/teachers/me/${path}`, { method: 'POST' }));
      setMessage({
        kind: 'success',
        text: path === 'publish' ? 'Your profile is live. Principals and directors can now find you.' : 'Your profile is hidden from principals and directors.',
      });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="stagger mx-auto max-w-2xl space-y-8 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{p.fullName ? `Welcome, ${p.fullName.split(' ')[0]}` : 'Welcome'}</h1>
        <p className="mt-1 text-slate-600">
          {p.isPublished ? 'Your profile is published and visible to principals and directors.' : 'Your profile is not published yet.'}
        </p>
      </div>

      <section aria-labelledby="completeness" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="completeness" className="text-lg font-semibold text-slate-900">
            Profile completeness
          </h2>
          <span className="text-2xl font-bold text-emerald-800">{completeness.score}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-200" role="progressbar" aria-valuenow={completeness.score} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-2 origin-left animate-grow-x rounded-full bg-emerald-700" style={{ width: `${completeness.score}%` }} />
        </div>
        <ul className="stagger divide-y divide-slate-200 rounded-lg border border-slate-200">
          {completeness.items.map((i) => (
            <li key={i.key} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-slate-800">
                <span aria-hidden className={i.complete ? 'text-emerald-700' : 'text-slate-400'}>
                  {i.complete ? '✓' : '○'}
                </span>{' '}
                {i.label}
                {i.required ? '' : ' (optional)'}
              </span>
              {i.complete ? (
                <span className="text-sm text-slate-500">Done</span>
              ) : (
                <Link href={stepHref(STEP_FOR[i.key])} className="text-sm font-semibold text-emerald-800 underline">
                  Add
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}

      {p.isPublished ? (
        <Button type="button" loading={busy} onClick={() => toggle('unpublish')} className="bg-stone-600 hover:bg-stone-500">
          Hide my profile
        </Button>
      ) : completeness.canPublish ? (
        <Button type="button" loading={busy} onClick={() => toggle('publish')}>
          Publish my profile
        </Button>
      ) : (
        <Link
          href="/teacher/onboarding"
          className="flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-600"
        >
          Continue profile setup
        </Link>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/teacher/jobs" className="lift rounded-lg border border-emerald-200 bg-emerald-50 p-4 hover:bg-emerald-100 sm:col-span-2">
          <p className="font-semibold text-emerald-900">Find teaching jobs</p>
          <p className="text-sm text-slate-600">Jobs that match your subjects, levels and location</p>
        </Link>
        <Link href="/teacher/applications" className="lift rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
          <p className="font-semibold text-slate-900">My applications</p>
          <p className="text-sm text-slate-600">Status of every job you applied for</p>
        </Link>
        <Link href="/teacher/invitations" className="lift rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
          <p className="font-semibold text-slate-900">Invitations</p>
          <p className="text-sm text-slate-600">Schools that invited you to apply</p>
        </Link>
        <Link href="/teacher/interviews" className="lift rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
          <p className="font-semibold text-slate-900">My interviews</p>
          <p className="text-sm text-slate-600">Confirm or suggest another time</p>
        </Link>
        <Link href="/teacher/cv" className="lift rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
          <p className="font-semibold text-slate-900">My CV</p>
          <p className="text-sm text-slate-600">{p.cv ? p.cv.fileName : 'Not uploaded yet'}</p>
        </Link>
        <Link href={stepHref('personal')} className="lift rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
          <p className="font-semibold text-slate-900">Edit profile</p>
          <p className="text-sm text-slate-600">Details, location, qualifications, experience, preferences</p>
        </Link>
      </section>
    </main>
  );
}
