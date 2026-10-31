import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const REQUIRE_VERIFIED = 'requireVerified';

/** No access token needed (PRD auth column "Public"). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Role check (PRD auth columns T / S / A). 'leader' = principal or director, who replace the
 * PRD's school owner/recruiter (user, 2026-10-31) and share the same access.
 * Ownership of the specific resource is still checked in the service.
 */
export type RoleKey = 'teacher' | 'leader' | 'admin';
export const Roles = (...roles: RoleKey[]) => SetMetadata(ROLES, roles);

/** Email or phone must be verified (FR-1: verification before onboarding starts). */
export const RequireVerified = () => SetMetadata(REQUIRE_VERIFIED, true);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);
