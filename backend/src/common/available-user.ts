import { Prisma } from '../generated/prisma/client';

/**
 * A user others can see and reach: active, not erased, and not waiting for account deletion
 * (DELETE /me hides the account straight away; signing in within 30 days cancels).
 */
export const AVAILABLE_USER = { status: 'active', deletedAt: null, deletionRequestedAt: null } as const satisfies Prisma.UserWhereInput;

/** SQL form of AVAILABLE_USER for the user alias `u`. */
export const availableUserSql = (alias: string) =>
  Prisma.raw(`${alias}.status = 'active' AND ${alias}.deleted_at IS NULL AND ${alias}.deletion_requested_at IS NULL`);

export function isAvailable(u: { status: string; deletedAt: Date | null; deletionRequestedAt: Date | null }): boolean {
  return u.status === 'active' && !u.deletedAt && !u.deletionRequestedAt;
}
