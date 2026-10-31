'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { OnboardingResponse } from '@edu-forum/shared';
import { useAuth } from '@/lib/auth';
import { isWizardStep, stepHref } from './wizard-steps';

/** /teacher/onboarding resumes at the first required step that is not done yet. */
export default function Page() {
  const router = useRouter();
  const { authed } = useAuth();

  useEffect(() => {
    void authed<OnboardingResponse>('/me/onboarding').then((o) => {
      const next = o.nextStep && isWizardStep(o.nextStep) ? o.nextStep : 'personal';
      router.replace(o.complete ? '/teacher' : stepHref(next));
    });
  }, [authed, router]);

  return <p className="px-4 py-10 text-center text-slate-500">Loading…</p>;
}
