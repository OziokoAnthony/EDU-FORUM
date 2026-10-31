'use client';

import { Alert, Button } from '@/components/ui';
import type { SchoolStepProps } from './types';

/** FR-3 step 4. Document submission is built in the identity verification phase. */
export function IdentificationStep({ onDone }: SchoolStepProps) {
  return (
    <div className="space-y-6">
      <Alert kind="info">
        School verification (CAC certificate or Ministry of Education approval letter, plus the contact person&apos;s ID) is
        coming soon. Until your school is verified, your vacancies are labelled &quot;unverified&quot; and you see a
        limited teacher profile: no CV download and no phone or email.
      </Alert>
      <Button type="button" onClick={onDone}>
        Continue
      </Button>
    </div>
  );
}
