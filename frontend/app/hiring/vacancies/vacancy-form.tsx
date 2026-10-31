'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import {
  BENEFIT_LABELS,
  BENEFITS,
  createVacancySchema,
  JOB_TYPE_LABELS,
  JOB_TYPES,
  MAX_SCREENING_QUESTIONS,
  SALARY_PERIOD_LABELS,
  SALARY_PERIODS,
  SCHOOL_TYPE_LABELS,
  SCHOOL_TYPES,
  type MyVacancyResponse,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { ChipGroup, SecondaryButton, Select } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';
import { useCertificationTypes, useLevels, useLgas, useQualificationTypes, useStates, useSubjects } from '@/lib/meta';
import { useRefreshVacancies } from '@/lib/vacancies';

// Heavy widgets load only when this form is opened.
const RichTextEditor = dynamic(() => import('@/components/rich-text-editor'), {
  ssr: false,
  loading: () => <div className="min-h-40 rounded-lg border border-slate-300 bg-slate-50" />,
});
const MapPin = dynamic(() => import('@/components/map-pin'), { ssr: false, loading: () => <p className="text-sm text-slate-500">Loading map…</p> });

type Input = z.input<typeof createVacancySchema>;
type Output = z.output<typeof createVacancySchema>;

const num = (v: unknown) => (v === '' || v == null ? undefined : Number(v));
const optionalNum = (v: unknown) => (v === '' || v == null ? null : Number(v));
const options = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((v) => ({ value: v, label: labels[v] }));

function defaults(v?: MyVacancyResponse): Input {
  if (!v) return { subjects: [], levels: [], benefits: [], requiredQualifications: [], requiredCertifications: [], screeningQuestions: [], locationVisibility: 'listed', salaryPeriod: 'monthly', openings: 1, description: '' } as unknown as Input;
  return {
    title: v.title,
    subjects: v.subjects,
    levels: v.levels,
    jobType: v.jobType,
    salaryMin: v.salaryMin,
    salaryMax: v.salaryMax,
    salaryPeriod: v.salaryPeriod,
    description: v.description,
    locationVisibility: v.locationVisibility,
    schoolName: v.schoolName ?? '',
    schoolType: v.schoolType,
    stateId: v.location.state.id,
    lgaId: v.location.lga.id,
    area: v.location.area ?? '',
    addressLine: v.location.addressLine ?? '',
    lat: v.location.lat,
    lng: v.location.lng,
    requiredQualifications: v.requiredQualifications,
    minExperienceYears: v.minExperienceYears,
    requiredCertifications: v.requiredCertifications,
    openings: v.openings,
    benefits: v.benefits,
    screeningQuestions: v.screeningQuestions,
    deadline: v.deadline,
    startDate: v.startDate,
  };
}

/** FR-4 vacancy form (create and edit). Location, details and salary range are compulsory. */
export function VacancyForm({ vacancy }: { vacancy?: MyVacancyResponse }) {
  const router = useRouter();
  const { authed } = useAuth();
  const refresh = useRefreshVacancies();
  const [formError, setFormError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(vacancy?.location.lat != null);
  const subjects = useSubjects();
  const levels = useLevels();
  const quals = useQualificationTypes();
  const certs = useCertificationTypes();
  const states = useStates();
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({ resolver: zodResolver(createVacancySchema), defaultValues: defaults(vacancy) });
  const questions = useFieldArray({ control, name: 'screeningQuestions' });
  const stateId = watch('stateId');
  const lgas = useLgas(stateId || undefined);
  const anonymous = watch('locationVisibility') === 'anonymous';
  const [lat, lng] = [watch('lat'), watch('lng')];
  const canPublish = !vacancy || vacancy.status === 'draft' || vacancy.status === 'paused';

  async function save(values: Output, publish: boolean) {
    setFormError(null);
    try {
      if (vacancy) {
        const { publish: _ignored, ...fields } = values;
        await authed(`/vacancies/${vacancy.id}`, { method: 'PATCH', body: fields });
        if (publish) await authed(`/vacancies/${vacancy.id}/publish`, { method: 'POST' });
      } else {
        await authed('/vacancies', { method: 'POST', body: { ...values, publish } });
      }
      refresh();
      router.push('/hiring');
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  const chip = (name: 'subjects' | 'levels' | 'requiredQualifications' | 'requiredCertifications' | 'benefits', label: string, opts: { value: string; label: string }[]) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <ChipGroup label={label} options={opts} value={(field.value as string[]) ?? []} onChange={field.onChange} error={errors[name]?.message} />
      )}
    />
  );

  return (
    <form noValidate className="space-y-8" onSubmit={handleSubmit((v) => save(v, false))}>
      <section className="space-y-5">
        <h2 className="text-lg font-semibold text-slate-900">The job</h2>
        <Field label="Job title" placeholder="e.g. SS2 Physics Teacher" error={errors.title?.message} {...register('title')} />
        {chip('subjects', 'Subjects', (subjects.data ?? []).map((s) => ({ value: s.slug, label: s.name })))}
        {chip('levels', 'Levels', (levels.data ?? []).map((l) => ({ value: l.slug, label: l.name })))}
        <Select label="Job type" placeholder="Choose…" options={options(JOB_TYPES, JOB_TYPE_LABELS)} error={errors.jobType?.message} {...register('jobType')} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">Salary range (₦)</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" type="number" inputMode="numeric" error={errors.salaryMin?.message} {...register('salaryMin', { setValueAs: num })} />
            <Field label="To" type="number" inputMode="numeric" error={errors.salaryMax?.message} {...register('salaryMax', { setValueAs: num })} />
          </div>
          <Select label="Paid" options={options(SALARY_PERIODS, SALARY_PERIOD_LABELS)} {...register('salaryPeriod')} />
        </fieldset>
        <div className="space-y-1">
          <label htmlFor="description" className="block text-sm font-medium text-slate-800">
            Job description
          </label>
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <RichTextEditor id="description" value={field.value ?? ''} onChange={field.onChange} invalid={!!errors.description} />
            )}
          />
          {errors.description ? (
            <p className="text-sm text-red-600">{errors.description.message}</p>
          ) : (
            <p className="text-sm text-slate-500">At least 100 characters: duties, requirements, how you support teachers.</p>
          )}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-lg font-semibold text-slate-900">School and location</h2>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">Show the school name?</legend>
          <label className="flex items-center gap-3">
            <input type="radio" value="listed" className="h-5 w-5 accent-emerald-700" {...register('locationVisibility')} /> Yes, show the school name
          </label>
          <label className="flex items-center gap-3">
            <input type="radio" value="anonymous" className="h-5 w-5 accent-emerald-700" {...register('locationVisibility')} /> No, post anonymously
          </label>
          {anonymous ? (
            <p className="text-sm text-slate-500">
              Teachers see &quot;Confidential school&quot; with the state, LGA and school type. The name and address are shown only
              to teachers you shortlist or invite.
            </p>
          ) : null}
        </fieldset>
        <Field
          label={anonymous ? 'School name (optional, kept private)' : 'School name'}
          autoComplete="organization"
          error={errors.schoolName?.message}
          {...register('schoolName')}
        />
        <Select
          label="School type (optional)"
          placeholder="Choose…"
          options={options(SCHOOL_TYPES, SCHOOL_TYPE_LABELS)}
          {...register('schoolType', { setValueAs: (v) => v || null })}
        />
        {/* Remount once options arrive so a saved value is selected (options load async). */}
        <Select
          key={`state-${states.data?.length ?? 0}`}
          label="State"
          placeholder="Choose a state…"
          options={(states.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          error={errors.stateId?.message}
          {...register('stateId', { onChange: () => setValue('lgaId', '') })}
        />
        <Select
          key={`lga-${stateId}-${lgas.data?.length ?? 0}`}
          label="LGA / city"
          placeholder={stateId ? 'Choose an LGA…' : 'Choose a state first'}
          disabled={!stateId}
          options={(lgas.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
          error={errors.lgaId?.message}
          {...register('lgaId')}
        />
        <Field label="Area (optional)" placeholder="e.g. Lekki Phase 1" error={errors.area?.message} {...register('area')} />
        <Field label="Address (optional)" autoComplete="street-address" error={errors.addressLine?.message} {...register('addressLine')} />
        {showMap ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-800">Map pin (optional): tap where the school is</p>
            <MapPin
              value={lat != null && lng != null ? { lat, lng } : null}
              onChange={(p) => {
                setValue('lat', p.lat);
                setValue('lng', p.lng);
              }}
            />
            <SecondaryButton
              onClick={() => {
                setValue('lat', null);
                setValue('lng', null);
                setShowMap(false);
              }}
            >
              Remove map pin
            </SecondaryButton>
          </div>
        ) : (
          <SecondaryButton onClick={() => setShowMap(true)}>Add a map pin (optional)</SecondaryButton>
        )}
      </section>

      <section className="space-y-5">
        <h2 className="text-lg font-semibold text-slate-900">Requirements (optional)</h2>
        {chip('requiredQualifications', 'Qualifications', (quals.data ?? []).map((q) => ({ value: q.slug, label: q.name })))}
        <Field
          label="Minimum years of experience"
          type="number"
          inputMode="numeric"
          error={errors.minExperienceYears?.message}
          {...register('minExperienceYears', { setValueAs: optionalNum })}
        />
        {chip('requiredCertifications', 'Certifications', (certs.data ?? []).map((c) => ({ value: c.slug, label: c.name })))}
      </section>

      <section className="space-y-5">
        <h2 className="text-lg font-semibold text-slate-900">More details (optional)</h2>
        <Field label="Number of openings" type="number" inputMode="numeric" error={errors.openings?.message} {...register('openings', { setValueAs: num })} />
        {chip('benefits', 'Benefits', options(BENEFITS, BENEFIT_LABELS))}
        <Field
          label="Application deadline"
          type="date"
          hint="Leave empty for 30 days after publishing."
          error={errors.deadline?.message}
          {...register('deadline', { setValueAs: (v) => v || null })}
        />
        <Field label="Start date" type="date" error={errors.startDate?.message} {...register('startDate', { setValueAs: (v) => v || null })} />
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-800">Screening questions (up to {MAX_SCREENING_QUESTIONS})</legend>
          {questions.fields.map((q, i) => (
            <div key={q.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <Field label={`Question ${i + 1}`} error={errors.screeningQuestions?.[i]?.question?.message} {...register(`screeningQuestions.${i}.question`)} />
              <div className="flex items-end justify-between gap-3">
                <Select
                  label="Answer type"
                  options={[
                    { value: 'text', label: 'Written answer' },
                    { value: 'yes_no', label: 'Yes / No' },
                  ]}
                  {...register(`screeningQuestions.${i}.type`)}
                />
                <button type="button" onClick={() => questions.remove(i)} className="pb-2 text-sm font-semibold text-red-700 underline">
                  Remove
                </button>
              </div>
            </div>
          ))}
          {questions.fields.length < MAX_SCREENING_QUESTIONS ? (
            <button type="button" onClick={() => questions.append({ question: '', type: 'text' })} className="font-semibold text-emerald-800 underline">
              + Add a question
            </button>
          ) : null}
        </fieldset>
      </section>

      {formError ? <Alert>{formError}</Alert> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        {canPublish ? (
          <Button type="button" loading={isSubmitting} onClick={handleSubmit((v) => save(v, true))}>
            {vacancy?.status === 'paused' ? 'Save and resume' : 'Publish'}
          </Button>
        ) : null}
        <SecondaryButton disabled={isSubmitting} onClick={handleSubmit((v) => save(v, false))} className="w-full">
          {vacancy && vacancy.status !== 'draft' ? 'Save changes' : 'Save as draft'}
        </SecondaryButton>
      </div>
    </form>
  );
}
