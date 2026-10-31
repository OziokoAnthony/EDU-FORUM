'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui';
import { useMyProfile } from '@/lib/teacher';
import { CertificationsStep } from './steps/certifications';
import { CvStep } from './steps/cv';
import { ExperienceStep } from './steps/experience';
import { IdentificationStep } from './steps/identification';
import { LocationStep } from './steps/location';
import { PersonalStep } from './steps/personal';
import { PreferencesStep } from './steps/preferences';
import { QualificationsStep } from './steps/qualifications';
import { nextHref, stepHref, WIZARD_STEPS, type WizardStepKey } from './wizard-steps';
import type { StepProps } from './steps/types';

const COMPONENTS: Record<WizardStepKey, (props: StepProps) => React.ReactNode> = {
  personal: PersonalStep,
  location: LocationStep,
  qualifications: QualificationsStep,
  certifications: CertificationsStep,
  experience: ExperienceStep,
  preferences: PreferencesStep,
  cv: CvStep,
  identification: IdentificationStep,
};

/** FR-2 onboarding wizard. Every step saves on its own, so the teacher can leave and resume. */
export function Wizard({ step }: { step: WizardStepKey }) {
  const router = useRouter();
  const profile = useMyProfile();
  const index = WIZARD_STEPS.findIndex((s) => s.key === step);
  const Step = COMPONENTS[step];

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <nav aria-label="Onboarding steps" className="mb-6">
        <p className="text-sm text-slate-600">
          Step {index + 1} of {WIZARD_STEPS.length}
        </p>
        <ol className="mt-2 flex gap-1" aria-hidden>
          {WIZARD_STEPS.map((s, i) => (
            <li key={s.key} className="flex-1">
              <Link href={stepHref(s.key)} className={`block h-1.5 rounded-full ${i <= index ? 'bg-emerald-700' : 'bg-slate-200'}`}>
                <span className="sr-only">{s.label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <h1 className="text-2xl font-bold text-slate-900">{WIZARD_STEPS[index].label}</h1>

      <div className="mt-6">
        {profile.isPending ? (
          <p className="text-slate-500">Loading…</p>
        ) : profile.isError ? (
          <Alert>Could not load your profile. Check your connection and refresh the page.</Alert>
        ) : (
          <Step profile={profile.data} onDone={() => router.push(nextHref(step))} />
        )}
      </div>

      <div className="mt-8 flex justify-between text-sm">
        {index > 0 ? (
          <Link href={stepHref(WIZARD_STEPS[index - 1].key)} className="text-emerald-800 underline">
            ← Back
          </Link>
        ) : (
          <span />
        )}
        <Link href="/teacher" className="text-slate-600 underline">
          Save and finish later
        </Link>
      </div>
    </main>
  );
}
