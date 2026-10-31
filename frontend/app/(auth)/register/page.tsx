import type { Metadata } from 'next';
import { safeNext } from '@/lib/next-path';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create an account' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <RegisterForm next={safeNext(next)} />;
}
