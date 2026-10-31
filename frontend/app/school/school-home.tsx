'use client';

import Link from 'next/link';
import { SCHOOL_TYPE_LABELS } from '@edu-forum/shared';
import { Alert } from '@/components/ui';
import { useMySchool, useOnboarding } from '@/lib/school';
import { isSchoolStep, schoolStepHref } from './onboarding/wizard-steps';

const VERIFICATION_TEXT = {
  unverified: 'Not verified yet. Your vacancies will be labelled "unverified".',
  pending: 'Verification documents are being reviewed.',
  verified: 'Verified school.',
  rejected: 'Verification was rejected. Please resubmit your documents.',
} as const;

/** School home: onboarding progress and links. Vacancies and stats are added in later phases. */
export function SchoolHome() {
  const school = useMySchool();
  const onboarding = useOnboarding();

  if (school.isPending || onboarding.isPending) return <p className="px-4 py-10 text-center text-slate-500">Loading…</p>;
  if (school.isError || onboarding.isError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Alert>Could not load your school. Check your connection and refresh the page.</Alert>
      </main>
    );
  }

  const s = school.data;
  const steps = (onboarding.data?.steps ?? []).filter((st) => isSchoolStep(st.key));

  if (!s) {
    return (
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Set up your school</h1>
        <p className="text-slate-600">Add your school&apos;s details and location so you can post vacancies and find teachers.</p>
        <Link
          href={schoolStepHref('details')}
          className="flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-800"
        >
          Start school setup
        </Link>
      </main>
    );
  }

  const isOwner = s.myRole === 'owner';
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{s.name}</h1>
        <p className="mt-1 text-slate-600">
          {SCHOOL_TYPE_LABELS[s.type]}
          {s.location.lga && s.location.state ? ` · ${s.location.lga.name}, ${s.location.state.name}` : ''}
        </p>
        <p className="mt-2 text-sm text-slate-600">{VERIFICATION_TEXT[s.verificationStatus]}</p>
      </div>

      <section aria-labelledby="setup" className="space-y-3">
        <h2 id="setup" className="text-lg font-semibold text-slate-900">
          School setup
        </h2>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {steps.map((st) => (
            <li key={st.key} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-slate-800">
                <span aria-hidden className={st.complete ? 'text-emerald-700' : 'text-slate-400'}>
                  {st.complete ? '✓' : '○'}
                </span>{' '}
                {st.label}
                {st.required ? '' : ' (optional)'}
              </span>
              {st.key === 'identification' && !st.complete ? (
                <span className="text-sm text-slate-500">Coming soon</span>
              ) : isOwner && isSchoolStep(st.key) ? (
                <Link href={schoolStepHref(st.key)} className="text-sm font-semibold text-emerald-800 underline">
                  {st.complete ? 'Edit' : 'Add'}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/school/team" className="rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
          <p className="font-semibold text-slate-900">Team</p>
          <p className="text-sm text-slate-600">{isOwner ? 'Invite recruiters and manage roles' : 'See who recruits for your school'}</p>
        </Link>
      </section>
    </main>
  );
}
