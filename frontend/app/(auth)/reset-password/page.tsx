import type { Metadata } from 'next';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Choose a new password' };

/** ?token= from the email link, or ?phone= after requesting an SMS code. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; phone?: string }>;
}) {
  const { token, phone } = await searchParams;
  return <ResetPasswordForm token={token ?? null} phone={phone ?? null} />;
}
