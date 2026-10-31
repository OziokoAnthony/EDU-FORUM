'use client';

import { TeamManager } from '@/components/team-manager';
import { Button } from '@/components/ui';
import type { SchoolStepProps } from './types';

/** FR-3 step 5 (optional): invite recruiters by email. */
export function TeamStep({ onDone }: SchoolStepProps) {
  return (
    <div className="space-y-6">
      <TeamManager isOwner />
      <Button type="button" onClick={onDone}>
        Finish
      </Button>
    </div>
  );
}
