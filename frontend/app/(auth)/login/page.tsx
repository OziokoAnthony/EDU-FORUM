import type { Metadata } from 'next';
import { safeNext } from '@/lib/next-path';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; deleted?: string }> }) {
  const { next, deleted } = await searchParams;
  // After DELETE /me: the date the data will be erased (shown as text only).
  const deletedOn = typeof deleted === 'string' && /^[\w ,]{4,40}$/.test(deleted) ? deleted : null;
  return <LoginForm next={safeNext(next)} deletedOn={deletedOn} />;
}
