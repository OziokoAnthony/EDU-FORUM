import type { SchoolResponse } from '@edu-forum/shared';

export interface SchoolStepProps {
  /** Null until the details step creates the school. */
  school: SchoolResponse | null;
  onDone: () => void;
}
