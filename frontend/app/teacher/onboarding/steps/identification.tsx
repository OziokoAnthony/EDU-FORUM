'use client';

import { Alert, Button } from '@/components/ui';
import type { StepProps } from './types';

/** FR-2 step 8. Submitting a government ID is built in the identity verification phase. */
export function IdentificationStep({ onDone }: StepProps) {
  return (
    <div className="space-y-6">
      <Alert kind="info">
        ID verification (NIN slip, voter&apos;s card, driver&apos;s licence or international passport) is coming soon. You
        can publish your profile without it. Verified profiles appear higher in school searches.
      </Alert>
      <Button type="button" onClick={onDone}>
        Review and publish
      </Button>
    </div>
  );
}
