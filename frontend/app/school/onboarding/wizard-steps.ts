/** FR-3: the five school onboarding steps, in order. Keys match /me/onboarding step keys. */
export const SCHOOL_STEPS = [
  { key: 'details', label: 'School details' },
  { key: 'location', label: 'Location' },
  { key: 'contact', label: 'Contact person' },
  { key: 'identification', label: 'Identification' },
  { key: 'team', label: 'Invite your team' },
] as const;

export type SchoolStepKey = (typeof SCHOOL_STEPS)[number]['key'];

export function isSchoolStep(key: string): key is SchoolStepKey {
  return SCHOOL_STEPS.some((s) => s.key === key);
}

export function schoolStepHref(key: SchoolStepKey): string {
  return `/school/onboarding/${key}`;
}

export function nextSchoolHref(key: SchoolStepKey): string {
  const i = SCHOOL_STEPS.findIndex((s) => s.key === key);
  const next = SCHOOL_STEPS[i + 1];
  return next ? schoolStepHref(next.key) : '/school';
}
