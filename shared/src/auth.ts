import { z } from 'zod';

/** Account roles stored on User. Admins are created by the seed, never by sign-up. */
export const USER_ROLES = ['teacher', 'principal', 'director', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Sign-up choice (user, 2026-10-31): principals and directors have the same access. */
export const SIGNUP_ROLES = ['teacher', 'principal', 'director'] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

/** Consent text version shown at sign-up (NDPA). Bump when the privacy policy changes. */
export const CONSENT_VERSION = '2026-10-31';

export const PASSWORD_MIN_LENGTH = 8;

/**
 * Nigerian mobile number in any common form (0803…, 234803…, +234 803 …).
 * Normalised to E.164: +2348031234567.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .transform((v) => (v.startsWith('+') ? v.slice(1) : v))
  .transform((v) => (v.startsWith('0') ? `234${v.slice(1)}` : v))
  .refine((v) => /^234[789][01]\d{8}$/.test(v), 'Enter a valid Nigerian mobile number')
  .transform((v) => `+${v}`);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128, 'Password is too long')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password must contain a letter and a number');

export const otpSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

/** POST /auth/register — email or phone (or both), password, role, NDPA consent. */
export const registerSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    password: passwordSchema,
    role: z.enum(SIGNUP_ROLES),
    consent: z.literal(true, 'You must accept the terms and privacy policy'),
  })
  .refine((v) => v.email || v.phone, { message: 'Enter an email or phone number', path: ['email'] });
export type RegisterInput = z.input<typeof registerSchema>;

/** Email address or phone number in one login field. */
export const identifierSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email or phone number')
  .transform((v, ctx) => {
    if (v.includes('@')) {
      const r = emailSchema.safeParse(v);
      if (r.success) return { kind: 'email' as const, value: r.data };
    } else {
      const r = phoneSchema.safeParse(v);
      if (r.success) return { kind: 'phone' as const, value: r.data };
    }
    ctx.addIssue({ code: 'custom', message: 'Enter a valid email or Nigerian phone number' });
    return z.NEVER;
  });

export const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.input<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(20) });

export const verifyPhoneSchema = z.object({ phone: phoneSchema, code: otpSchema });
export type VerifyPhoneInput = z.input<typeof verifyPhoneSchema>;

export const resendVerificationSchema = z.object({ identifier: identifierSchema });

export const forgotPasswordSchema = z.object({ identifier: identifierSchema });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

/** Email users reset with the link token; phone users with the SMS code. */
export const resetPasswordSchema = z.union([
  z.object({ token: z.string().min(20), password: passwordSchema }),
  z.object({ phone: phoneSchema, code: otpSchema, password: passwordSchema }),
]);
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1), newPassword: passwordSchema })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must be different',
    path: ['newPassword'],
  });

export const refreshSchema = z.object({ refreshToken: z.string().min(20).optional() });

/** PATCH /me */
export const updateMeSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    notificationSettings: z.record(z.string(), z.boolean()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export interface AuthTokensResponse {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  user: MeResponse;
}

export interface MeResponse {
  id: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: 'active' | 'suspended';
  emailVerified: boolean;
  phoneVerified: boolean;
  /** True once the email or phone used to sign up is verified; onboarding starts after this. */
  verified: boolean;
  notificationSettings: Record<string, boolean>;
  deletionRequestedAt: string | null;
  createdAt: string;
}

export interface OnboardingStep {
  key: string;
  label: string;
  required: boolean;
  complete: boolean;
}

export interface OnboardingResponse {
  role: UserRole;
  verified: boolean;
  steps: OnboardingStep[];
  /** First incomplete required step, for resuming the wizard. */
  nextStep: string | null;
  complete: boolean;
}
