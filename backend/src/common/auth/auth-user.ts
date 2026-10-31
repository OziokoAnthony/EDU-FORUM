import type { UserRole } from '@edu-forum/shared';

/** The signed-in user attached to the request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: UserRole;
  /** Email or phone verified; onboarding endpoints require this. */
  verified: boolean;
}

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}
