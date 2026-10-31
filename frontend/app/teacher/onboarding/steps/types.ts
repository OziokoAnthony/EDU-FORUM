import type { TeacherProfileResponse } from '@edu-forum/shared';

export interface StepProps {
  profile: TeacherProfileResponse;
  /** Go to the next step. */
  onDone: () => void;
}
