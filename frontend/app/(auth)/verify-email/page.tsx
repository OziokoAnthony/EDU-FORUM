import type { Metadata } from 'next';
import { VerifyEmail } from './verify-email';

export const metadata: Metadata = { title: 'Verify your email' };

/** With ?token= (from the email link) it verifies; without, it asks the user to check their inbox. */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <VerifyEmail token={token ?? null} />;
}
