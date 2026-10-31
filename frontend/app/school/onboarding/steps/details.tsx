'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  createSchoolSchema,
  CURRICULA,
  CURRICULUM_LABELS,
  OWNERSHIP_LABELS,
  POPULATION_BAND_LABELS,
  POPULATION_BANDS,
  SCHOOL_OWNERSHIPS,
  SCHOOL_TYPE_LABELS,
  SCHOOL_TYPES,
  type LogoUploadResponse,
  type SchoolResponse,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { FileUpload } from '@/components/file-upload';
import { ChipGroup, Select, TextArea } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';
import { useRefreshSchool } from '@/lib/school';
import type { SchoolStepProps } from './types';

type Input = z.input<typeof createSchoolSchema>;
type Output = z.output<typeof createSchoolSchema>;

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((v) => ({ value: v, label: labels[v] }));

/** Creates the school (POST /schools) the first time; edits it (PATCH /schools/me) after. */
export function DetailsStep({ school, onDone }: SchoolStepProps) {
  const { authed } = useAuth();
  const refresh = useRefreshSchool();
  const [formError, setFormError] = useState<string | null>(null);
  const [logoNote, setLogoNote] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(createSchoolSchema),
    defaultValues: school
      ? {
          name: school.name,
          type: school.type,
          ownership: school.ownership,
          curriculum: school.curriculum,
          populationBand: school.populationBand,
          website: school.website ?? '',
          description: school.description ?? '',
        }
      : { curriculum: [] },
  });

  async function onSubmit(values: Output) {
    setFormError(null);
    try {
      const saved = school
        ? await authed<SchoolResponse>('/schools/me', { method: 'PATCH', body: values })
        : await authed<SchoolResponse>('/schools', { method: 'POST', body: values });
      refresh(saved);
      onDone();
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  return (
    <div className="space-y-6">
      {school ? (
        <section className="flex items-center gap-4">
          {school.logoUrl ? (
            // Signed, short-lived URL from private storage: next/image cannot optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt={`${school.name} logo`} width={72} height={72} className="h-18 w-18 rounded-lg object-contain" />
          ) : (
            <div className="flex h-18 w-18 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">No logo</div>
          )}
          <div>
            <FileUpload
              purpose="school_logo"
              label={school.logoUrl ? 'Change logo' : 'Add a logo (optional)'}
              onUploaded={async (uploadId) => {
                const res = await authed<LogoUploadResponse>('/schools/me/logo', { method: 'POST', body: { uploadId } });
                setLogoNote(res.scanStatus === 'clean' ? 'Logo updated.' : 'Logo uploaded. It appears once our safety check finishes.');
                refresh();
              }}
            />
            {logoNote ? <p className="text-sm text-emerald-800">{logoNote}</p> : null}
          </div>
        </section>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Field label="School name" autoComplete="organization" error={errors.name?.message} {...register('name')} />
        <Select label="Type" placeholder="Choose…" options={options(SCHOOL_TYPES, SCHOOL_TYPE_LABELS)} error={errors.type?.message} {...register('type')} />
        <Select
          label="Ownership"
          placeholder="Choose…"
          options={options(SCHOOL_OWNERSHIPS, OWNERSHIP_LABELS)}
          error={errors.ownership?.message}
          {...register('ownership')}
        />
        <Controller
          control={control}
          name="curriculum"
          render={({ field }) => (
            <ChipGroup
              label="Curriculum (choose all that apply)"
              options={options(CURRICULA, CURRICULUM_LABELS)}
              value={field.value ?? []}
              onChange={field.onChange}
              error={errors.curriculum?.message}
            />
          )}
        />
        <Select
          label="Student population (optional)"
          placeholder="Choose…"
          options={options(POPULATION_BANDS, POPULATION_BAND_LABELS)}
          {...register('populationBand', { setValueAs: (v) => v || null })}
        />
        <Field label="Website (optional)" inputMode="url" placeholder="e.g. greenfield.edu.ng" error={errors.website?.message} {...register('website')} />
        <TextArea label="About the school (optional)" maxLength={2000} error={errors.description?.message} {...register('description')} />
        {formError ? <Alert>{formError}</Alert> : null}
        <Button type="submit" loading={isSubmitting}>
          {school ? 'Save and continue' : 'Create school and continue'}
        </Button>
      </form>
    </div>
  );
}
