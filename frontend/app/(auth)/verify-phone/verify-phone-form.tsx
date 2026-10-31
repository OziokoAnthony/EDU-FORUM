'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { verifyPhoneSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { Alert, AuthCard, Button, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';

type Input = z.input<typeof verifyPhoneSchema>;
type Output = z.output<typeof verifyPhoneSchema>;

export function VerifyPhoneForm({ initialPhone }: { initialPhone: string }) {
  const router = useRouter();
  const { user, reloadUser } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(verifyPhoneSchema),
    defaultValues: { phone: initialPhone || user?.phone || '' },
  });

  async function onSubmit(values: Output) {
    setFormError(null);
    try {
      await api('/auth/verify-phone', { method: 'POST', body: values });
      const me = await reloadUser();
      router.push(me ? homeFor(me) : '/login');
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  async function resend() {
    const phone = getValues('phone');
    if (!phone) return;
    await api('/auth/resend-verification', { method: 'POST', body: { identifier: phone } }).catch(() => undefined);
    setNotice('If that number has an account, we sent a new code.');
  }

  return (
    <AuthCard title="Enter the code we texted you">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Field label="Phone number" type="tel" inputMode="tel" autoComplete="tel" error={errors.phone?.message} {...register('phone')} />
        <Field
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          error={errors.code?.message}
          {...register('code')}
        />
        {formError ? <Alert>{formError}</Alert> : null}
        {notice ? <Alert kind="success">{notice}</Alert> : null}
        <Button type="submit" loading={isSubmitting}>
          Verify phone
        </Button>
        <button type="button" onClick={resend} className="w-full text-sm font-semibold text-emerald-800 underline">
          Send a new code
        </button>
      </form>
    </AuthCard>
  );
}
