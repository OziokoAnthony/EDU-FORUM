import type { MeResponse } from '@edu-forum/shared';
import type { User } from '../../generated/prisma/client';

export function toMeResponse(user: User): MeResponse {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    emailVerified: !!user.emailVerifiedAt,
    phoneVerified: !!user.phoneVerifiedAt,
    verified: !!(user.emailVerifiedAt || user.phoneVerifiedAt),
    notificationSettings: (user.notificationSettings ?? {}) as Record<string, boolean>,
    deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
