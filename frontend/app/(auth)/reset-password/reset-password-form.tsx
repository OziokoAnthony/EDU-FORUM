'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { otpSchema, passwordSchema, phoneSchema } from '@edu-forum/shared';
import { z } from 'zod';
import { Alert, AuthCard, Button, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/form-errors';

// Same rules as the shared resetPasswordSchema, split by mode so the form shows only its fields.
const byLink = z.object({ password: passwordSchema });
const byCode = z.object({ phone: phoneSchema, code: otpSchema, password: passwordSchema });

export function ResetPasswordForm({ token, phone }: { token: string | null; phone: string | null }) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ phone?: string; code?: string; password: string }>({
    resolver: zodResolver(token ? byLink : byCode) as never,
    defaultValues: { phone: phone ?? '' },
  });

  async function onSubmit(values: { phone?: string; code?: string; password: string }) {
    setFormError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: token ? { token, password: values.password } : values });
      setDone(true);
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  if (done) {
    return (
      <AuthCard title="Password changed">
        <Alert kind="success">Your password has been reset. You have been signed out on all devices.</Alert>
        <Link href="/login" className="block rounded-lg bg-emerald-700 px-4 py-3 text-center font-semibold text-white">
          Sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {!token ? (
          <>
            <Field label="Phone number" type="tel" inputMode="tel" error={errors.phone?.message} {...register('phone')} />
            <Field
              label="6-digit code from SMS"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              error={errors.code?.message}
              {...register('code')}
            />
          </>
        ) : null}
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number"
          error={errors.password?.message}
          {...register('password')}
        />
        {formError ? <Alert>{formError}</Alert> : null}
        <Button type="submit" loading={isSubmitting}>
          Save new password
        </Button>
      </form>
    </AuthCard>
  );
}
