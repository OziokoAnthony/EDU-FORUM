import type { Metadata } from 'next';
import { VerifyPhoneForm } from './verify-phone-form';

export const metadata: Metadata = { title: 'Verify your phone' };

export default async function VerifyPhonePage({ searchParams }: { searchParams: Promise<{ phone?: string }> }) {
  const { phone } = await searchParams;
  return <VerifyPhoneForm initialPhone={phone ?? ''} />;
}
