'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CONTACT_TITLE_LABELS, CONTACT_TITLES, contactSchema, type SchoolResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import { Select } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';
import { useRefreshSchool } from '@/lib/school';
import type { SchoolStepProps } from './types';

type Input = z.input<typeof contactSchema>;
type Output = z.output<typeof contactSchema>;

/** FR-3 step 3. Pre-filled with the owner's email/phone (confirmed 2026-10-31); editable. */
export function ContactStep({ school, onDone }: SchoolStepProps) {
  const { authed } = useAuth();
  const refresh = useRefreshSchool();
  const [formError, setFormError] = useState<string | null>(null);
  const c = school!.contact;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(contactSchema),
    defaultValues: { contactName: c.name ?? '', contactTitle: c.title ?? undefined, contactPhone: c.phone ?? '', contactEmail: c.email ?? '' },
  });

  async function onSubmit(values: Output) {
    setFormError(null);
    try {
      refresh(await authed<SchoolResponse>('/schools/me', { method: 'PATCH', body: values }));
      onDone();
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <p className="text-slate-600">The person teachers and our team can contact about vacancies.</p>
      <Field label="Full name" autoComplete="name" error={errors.contactName?.message} {...register('contactName')} />
      <Select
        label="Title"
        placeholder="Choose…"
        options={CONTACT_TITLES.map((t) => ({ value: t, label: CONTACT_TITLE_LABELS[t] }))}
        error={errors.contactTitle?.message}
        {...register('contactTitle')}
      />
      <Field label="Phone number" type="tel" autoComplete="tel" error={errors.contactPhone?.message} {...register('contactPhone')} />
      <Field label="Email address" type="email" autoComplete="email" error={errors.contactEmail?.message} {...register('contactEmail')} />
      {formError ? <Alert>{formError}</Alert> : null}
      <Button type="submit" loading={isSubmitting}>
        Save and continue
      </Button>
    </form>
  );
}
