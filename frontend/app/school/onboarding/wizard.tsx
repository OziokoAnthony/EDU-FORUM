'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui';
import { useMySchool } from '@/lib/school';
import { ContactStep } from './steps/contact';
import { DetailsStep } from './steps/details';
import { IdentificationStep } from './steps/identification';
import { LocationStep } from './steps/location';
import { TeamStep } from './steps/team';
import type { SchoolStepProps } from './steps/types';
import { nextSchoolHref, SCHOOL_STEPS, schoolStepHref, type SchoolStepKey } from './wizard-steps';

const COMPONENTS: Record<SchoolStepKey, (props: SchoolStepProps) => React.ReactNode> = {
  details: DetailsStep,
  location: LocationStep,
  contact: ContactStep,
  identification: IdentificationStep,
  team: TeamStep,
};

/** FR-3 school onboarding. Each step saves on its own, so it can be finished later. */
export function SchoolWizard({ step }: { step: SchoolStepKey }) {
  const router = useRouter();
  const school = useMySchool();
  const index = SCHOOL_STEPS.findIndex((s) => s.key === step);
  const Step = COMPONENTS[step];
  const needsSchool = step !== 'details' && school.data === null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <nav aria-label="Onboarding steps" className="mb-6">
        <p className="text-sm text-slate-600">
          Step {index + 1} of {SCHOOL_STEPS.length}
        </p>
        <ol className="mt-2 flex gap-1" aria-hidden>
          {SCHOOL_STEPS.map((s, i) => (
            <li key={s.key} className="flex-1">
              <Link href={schoolStepHref(s.key)} className={`block h-1.5 rounded-full ${i <= index ? 'bg-emerald-700' : 'bg-slate-200'}`}>
                <span className="sr-only">{s.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <h1 className="text-2xl font-bold text-slate-900">{SCHOOL_STEPS[index].label}</h1>

      <div className="mt-6">
        {school.isPending ? (
          <p className="text-slate-500">Loading…</p>
        ) : school.isError ? (
          <Alert>Could not load your school. Check your connection and refresh the page.</Alert>
        ) : needsSchool ? (
          <Alert kind="info">
            Start with your{' '}
            <Link href={schoolStepHref('details')} className="font-semibold underline">
              school details
            </Link>
            .
          </Alert>
        ) : school.data && school.data.myRole !== 'owner' ? (
          <Alert kind="info">Only a school owner can change these details.</Alert>
        ) : (
          <Step school={school.data} onDone={() => router.push(nextSchoolHref(step))} />
        )}
      </div>

      <div className="mt-8 flex justify-between text-sm">
        {index > 0 ? (
          <Link href={schoolStepHref(SCHOOL_STEPS[index - 1].key)} className="text-emerald-800 underline">
            ← Back
          </Link>
        ) : (
          <span />
        )}
        <Link href="/school" className="text-slate-600 underline">
          Save and finish later
        </Link>
      </div>
    </main>
  );
}
