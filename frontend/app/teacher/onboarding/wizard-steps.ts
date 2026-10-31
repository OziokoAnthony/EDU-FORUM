/** FR-2: the eight onboarding steps, in order. Keys match /me/onboarding step keys. */
export const WIZARD_STEPS = [
  { key: 'personal', label: 'Personal details' },
  { key: 'location', label: 'Location' },
  { key: 'qualifications', label: 'Qualifications' },
  { key: 'certifications', label: 'Teaching certifications' },
  { key: 'experience', label: 'Work experience' },
  { key: 'preferences', label: 'Teaching preferences' },
  { key: 'cv', label: 'CV upload' },
  { key: 'identification', label: 'Identification' },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]['key'];

export function isWizardStep(key: string): key is WizardStepKey {
  return WIZARD_STEPS.some((s) => s.key === key);
}

export function stepHref(key: WizardStepKey): string {
  return `/teacher/onboarding/${key}`;
}

/** Where "continue" goes from a step: the next step, or the dashboard after the last one. */
export function nextHref(key: WizardStepKey): string {
  const i = WIZARD_STEPS.findIndex((s) => s.key === key);
  const next = WIZARD_STEPS[i + 1];
  return next ? stepHref(next.key) : '/teacher';
}
