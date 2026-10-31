'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useOnboarding } from '@/lib/school';
import { isSchoolStep, schoolStepHref } from './wizard-steps';

/** /school/onboarding resumes at the first required step that is not done yet. */
export default function Page() {
  const router = useRouter();
  const onboarding = useOnboarding();

  useEffect(() => {
    const o = onboarding.data;
    if (!o) return;
    const next = o.nextStep && isSchoolStep(o.nextStep) ? o.nextStep : 'details';
    router.replace(o.complete ? '/school' : schoolStepHref(next));
  }, [onboarding.data, router]);

  return <p className="px-4 py-10 text-center text-slate-500">Loading…</p>;
}
