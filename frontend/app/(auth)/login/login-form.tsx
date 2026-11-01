'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { loginSchema, type AuthTokensResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import { rememberDeletionCancelled } from '@/components/account-settings';
import { Alert, AuthCard, Button, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';

type Input = z.input<typeof loginSchema>;
type Output = z.output<typeof loginSchema>;

export function LoginForm({ next, deletedOn }: { next?: string | null; deletedOn?: string | null }) {
  const router = useRouter();
  const { status, user, setSession } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({ resolver: zodResolver(loginSchema) });

  // Signed in (or session restored from the refresh cookie): go back to `next`, or home.
  useEffect(() => {
    if (status === 'signed-in' && user) router.replace(next ?? homeFor(user));
  }, [status, user, router, next]);

  async function onSubmit(values: Output) {
    setFormError(null);
    try {
      const res = await api<AuthTokensResponse>('/auth/login', {
        method: 'POST',
        body: { identifier: values.identifier.value, password: values.password },
      });
      if (res.deletionCancelled) rememberDeletionCancelled();
      setSession(res);
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          New to EDU-FORUM?{' '}
          <Link href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'} className="font-semibold text-emerald-800 underline">
            Create a free account
          </Link>
        </>
      }
    >
      {deletedOn ? (
        <div className="mb-5">
          <Alert kind="info">
            Your account is hidden and will be deleted on {deletedOn}. Changed your mind? Sign in before then to keep it.
          </Alert>
        </div>
      ) : null}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Field
          label="Email or phone number"
          autoComplete="username"
          error={errors.identifier?.message}
          {...register('identifier')}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <p className="text-right text-sm">
          <Link href="/forgot-password" className="text-emerald-800 underline">
            Forgot password?
          </Link>
        </p>
        {formError ? <Alert>{formError}</Alert> : null}
        <Button type="submit" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
