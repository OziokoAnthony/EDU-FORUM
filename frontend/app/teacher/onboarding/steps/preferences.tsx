'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { JOB_TYPE_LABELS, JOB_TYPES, preferencesSchema, type TeacherProfileResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import { ChipGroup } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';
import { useLevels, useSubjects } from '@/lib/meta';
import { useRefreshTeacher } from '@/lib/teacher';
import type { StepProps } from './types';

type Input = z.input<typeof preferencesSchema>;
type Output = z.output<typeof preferencesSchema>;

const optionalNumber = (v: unknown) => (v === '' || v == null ? null : Number(v));

export function PreferencesStep({ profile, onDone }: StepProps) {
  const { authed } = useAuth();
  const refresh = useRefreshTeacher();
  const subjects = useSubjects();
  const levels = useLevels();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      subjects: profile.subjects,
      levels: profile.levels,
      jobTypes: profile.jobTypes,
      expectedSalaryMin: profile.expectedSalaryMin,
      expectedSalaryMax: profile.expectedSalaryMax,
      availableFrom: profile.availableFrom,
    },
  });

  async function onSubmit(values: Output) {
    setFormError(null);
    try {
      refresh(await authed<TeacherProfileResponse>('/teachers/me/preferences', { method: 'PUT', body: values }));
      onDone();
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Controller
        control={control}
        name="subjects"
        render={({ field }) => (
          <ChipGroup
            label="Subjects you want to teach"
            options={(subjects.data ?? []).map((s) => ({ value: s.slug, label: s.name }))}
            value={field.value ?? []}
            onChange={field.onChange}
            error={errors.subjects?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="levels"
        render={({ field }) => (
          <ChipGroup
            label="Levels"
            options={(levels.data ?? []).map((l) => ({ value: l.slug, label: l.name }))}
            value={field.value ?? []}
            onChange={field.onChange}
            error={errors.levels?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="jobTypes"
        render={({ field }) => (
          <ChipGroup
            label="Job type"
            options={JOB_TYPES.map((j) => ({ value: j, label: JOB_TYPE_LABELS[j] }))}
            value={field.value ?? []}
            onChange={field.onChange}
            error={errors.jobTypes?.message}
          />
        )}
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">Expected monthly salary in ₦ (optional)</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="From"
            type="number"
            inputMode="numeric"
            error={errors.expectedSalaryMin?.message}
            {...register('expectedSalaryMin', { setValueAs: optionalNumber })}
          />
          <Field
            label="To"
            type="number"
            inputMode="numeric"
            error={errors.expectedSalaryMax?.message}
            {...register('expectedSalaryMax', { setValueAs: optionalNumber })}
          />
        </div>
      </fieldset>
      <Field
        label="Available from (optional)"
        type="date"
        error={errors.availableFrom?.message}
        {...register('availableFrom', { setValueAs: (v) => v || null })}
      />
      {formError ? <Alert>{formError}</Alert> : null}
      <Button type="submit" loading={isSubmitting}>
        Save and continue
      </Button>
    </form>
  );
}
