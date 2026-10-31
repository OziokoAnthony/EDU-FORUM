'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { forgotPasswordSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { Alert, AuthCard, Button, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/form-errors';

type Input = z.input<typeof forgotPasswordSchema>;
type Output = z.output<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit({ identifier }: Output) {
    setFormError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { identifier: identifier.value } });
      // Phone users type the SMS code on the reset page; email users follow the link.
      if (identifier.kind === 'phone') router.push(`/reset-password?phone=${encodeURIComponent(identifier.value)}`);
      else setSentTo(identifier.value);
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  if (sentTo) {
    return (
      <AuthCard title="Check your email">
        <Alert kind="success">
          If an account exists for <strong>{sentTo}</strong>, we sent a link to reset your password. It expires in 1 hour.
        </Alert>
        <Link href="/login" className="block text-center font-semibold text-emerald-800 underline">
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Field
          label="Email or phone number"
          autoComplete="username"
          hint="We'll email you a link or text you a code"
          error={errors.identifier?.message}
          {...register('identifier')}
        />
        {formError ? <Alert>{formError}</Alert> : null}
        <Button type="submit" loading={isSubmitting}>
          Continue
        </Button>
      </form>
    </AuthCard>
  );
}
