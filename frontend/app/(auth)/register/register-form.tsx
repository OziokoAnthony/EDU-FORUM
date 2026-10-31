'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { registerSchema, type AuthTokensResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import { Alert, AuthCard, Button, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';

type Input = z.input<typeof registerSchema>;
type Output = z.output<typeof registerSchema>;

export function RegisterForm({ next }: { next?: string | null }) {
  const router = useRouter();
  const { setSession } = useAuth();
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'teacher' },
  });
  const role = watch('role');

  async function onSubmit(values: Output) {
    setFormError(null);
    try {
      const res = await api<AuthTokensResponse>('/auth/register', { method: 'POST', body: values });
      setSession(res);
      if (next) return router.push(next);
      const home = homeFor(res.user);
      router.push(home === '/verify-phone' ? `/verify-phone?phone=${encodeURIComponent(res.user.phone ?? '')}` : home);
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  function chooseMethod(next: 'email' | 'phone') {
    setMethod(next);
    setValue(next === 'email' ? 'phone' : 'email', undefined);
  }

  return (
    <AuthCard
      title="Create your free account"
      footer={
        <>
          Already have an account?{' '}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="font-semibold text-emerald-800 underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">I am a</legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['teacher', 'Teacher', 'Looking for a job'],
                ['principal', 'Principal', 'Hiring teachers'],
                ['director', 'Director', 'Hiring teachers'],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-lg border px-2 py-3 ${role === value ? 'border-emerald-700 bg-emerald-50' : 'border-slate-300'}`}
              >
                <input type="radio" value={value} {...register('role')} className="sr-only" />
                <span className="block font-semibold">{label}</span>
                <span className="block text-sm text-slate-600">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex gap-4 text-sm" role="group" aria-label="Sign up with">
          {(['email', 'phone'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => chooseMethod(m)}
              aria-pressed={method === m}
              className={method === m ? 'font-semibold text-emerald-800 underline' : 'text-slate-600'}
            >
              Use {m === 'email' ? 'email' : 'phone number'}
            </button>
          ))}
        </div>

        {method === 'email' ? (
          <Field label="Email address" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        ) : (
          <Field
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0803 123 4567"
            hint="We'll text you a 6-digit code"
            error={errors.phone?.message}
            {...register('phone')}
          />
        )}

        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="space-y-1">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1 h-4 w-4" {...register('consent')} />
            <span>
              I agree to the <Link href="/terms" className="underline">terms</Link> and{' '}
              <Link href="/privacy" className="underline">privacy policy</Link>, and consent to EDU-FORUM processing my
              data under the Nigeria Data Protection Act 2023.
            </span>
          </label>
          {errors.consent ? <p className="text-sm text-red-600">{errors.consent.message}</p> : null}
        </div>

        {formError ? <Alert>{formError}</Alert> : null}
        <Button type="submit" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
