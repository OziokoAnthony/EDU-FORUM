'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { EXPERIENCE_KIND_LABELS, EXPERIENCE_KINDS, experienceSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { Checkbox, ChipGroup, Select, TextArea } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';
import { nameBySlug, useLevels, useSubjects } from '@/lib/meta';
import { useRefreshTeacher } from '@/lib/teacher';
import { ItemCard } from './item-list';
import type { StepProps } from './types';

type Input = z.input<typeof experienceSchema>;
type Output = z.output<typeof experienceSchema>;

export function ExperienceStep({ profile, onDone }: StepProps) {
  const { authed } = useAuth();
  const refresh = useRefreshTeacher();
  const subjects = useSubjects();
  const items = profile.experiences;
  const [adding, setAdding] = useState(items.length === 0);
  const subjectName = nameBySlug(subjects.data);

  return (
    <div className="space-y-6">
      <p className="text-slate-600">
        Add your teaching jobs. No experience yet? Add your NYSC posting or teaching practice instead.
      </p>
      {items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((e) => (
            <ItemCard
              key={e.id}
              title={`${e.role}, ${e.schoolName}`}
              lines={[
                `${EXPERIENCE_KIND_LABELS[e.kind]} · ${e.startDate} to ${e.isCurrent ? 'now' : e.endDate}`,
                e.subjects.length ? e.subjects.map(subjectName).join(', ') : null,
              ]}
              onRemove={async () => {
                await authed(`/teachers/me/experiences/${e.id}`, { method: 'DELETE' });
                refresh();
              }}
            />
          ))}
        </ul>
      ) : null}

      {adding ? (
        <AddExperience
          authed={authed}
          onSaved={() => {
            refresh();
            setAdding(false);
          }}
          onCancel={items.length > 0 ? () => setAdding(false) : undefined}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="font-semibold text-emerald-800 underline">
          + Add another entry
        </button>
      )}

      <Button type="button" disabled={items.length === 0} onClick={onDone}>
        Continue
      </Button>
    </div>
  );
}

function AddExperience({
  authed,
  onSaved,
  onCancel,
}: {
  authed: ReturnType<typeof useAuth>['authed'];
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const subjects = useSubjects();
  const levels = useLevels();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(experienceSchema),
    defaultValues: { kind: 'job', subjects: [], levels: [], isCurrent: false },
  });
  const isCurrent = watch('isCurrent');

  async function onSubmit(values: Output) {
    setFormError(null);
    try {
      await authed('/teachers/me/experiences', { method: 'POST', body: values });
      onSaved();
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5 rounded-lg border border-slate-200 p-4">
      <Select
        label="Type"
        options={EXPERIENCE_KINDS.map((k) => ({ value: k, label: EXPERIENCE_KIND_LABELS[k] }))}
        {...register('kind')}
      />
      <Field label="School name" error={errors.schoolName?.message} {...register('schoolName')} />
      <Field label="Role" placeholder="e.g. Mathematics teacher" error={errors.role?.message} {...register('role')} />
      <Controller
        control={control}
        name="subjects"
        render={({ field }) => (
          <ChipGroup
            label="Subjects taught (optional)"
            options={(subjects.data ?? []).map((s) => ({ value: s.slug, label: s.name }))}
            value={field.value ?? []}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="levels"
        render={({ field }) => (
          <ChipGroup
            label="Levels taught (optional)"
            options={(levels.data ?? []).map((l) => ({ value: l.slug, label: l.name }))}
            value={field.value ?? []}
            onChange={field.onChange}
          />
        )}
      />
      <Field label="Start date" type="date" error={errors.startDate?.message} {...register('startDate')} />
      <Checkbox label="I work here now" {...register('isCurrent')} />
      {!isCurrent ? (
        <Field
          label="End date"
          type="date"
          error={errors.endDate?.message}
          {...register('endDate', { setValueAs: (v) => v || null, shouldUnregister: true })}
        />
      ) : null}
      <TextArea label="Description (optional)" maxLength={2000} error={errors.description?.message} {...register('description')} />
      {formError ? <Alert>{formError}</Alert> : null}
      <div className="flex gap-3">
        <Button type="submit" loading={isSubmitting}>
          Save entry
        </Button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="px-3 text-slate-600 underline">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
