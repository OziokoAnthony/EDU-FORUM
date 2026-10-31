'use client';

import { CvManager } from '@/components/cv-manager';
import { Button } from '@/components/ui';
import { useMyCv } from '@/lib/teacher';
import type { StepProps } from './types';

export function CvStep({ onDone }: StepProps) {
  const cv = useMyCv();
  return (
    <div className="space-y-6">
      <CvManager />
      <Button type="button" disabled={!cv.data?.active} onClick={onDone}>
        Continue
      </Button>
    </div>
  );
}
