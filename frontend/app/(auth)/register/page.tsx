import type { Metadata } from 'next';
import { safeNext } from '@/lib/next-path';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create an account' };

/** `?email=&role=school&next=` come from a school team invite link. */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; role?: string; next?: string }>;
}) {
  const { email, role, next } = await searchParams;
  return <RegisterForm email={email} role={role === 'school' ? 'school' : undefined} next={safeNext(next)} />;
}
