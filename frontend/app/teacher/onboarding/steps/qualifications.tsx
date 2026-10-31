'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { qualificationSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { FileUpload } from '@/components/file-upload';
import { Select } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';
import { useQualificationTypes } from '@/lib/meta';
import { useRefreshTeacher } from '@/lib/teacher';
import { fileStatusText, ItemCard } from './item-list';
import type { StepProps } from './types';

type Input = z.input<typeof qualificationSchema>;
type Output = z.output<typeof qualificationSchema>;

export function QualificationsStep({ profile, onDone }: StepProps) {
  const { authed } = useAuth();
  const refresh = useRefreshTeacher();
  const types = useQualificationTypes();
  const items = profile.qualifications;
  const [adding, setAdding] = useState(items.length === 0);

  return (
    <div className="space-y-6">
      <p className="text-slate-600">Add at least one qualification, e.g. NCE, B.Ed or B.Sc + PGDE.</p>
      {items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((q) => (
            <ItemCard
              key={q.id}
              title={`${q.qualificationType.name} ${q.course}`}
              lines={[`${q.institution}, ${q.yearObtained}`, fileStatusText(q.hasFile, q.fileScanStatus)]}
              onRemove={async () => {
                await authed(`/teachers/me/qualifications/${q.id}`, { method: 'DELETE' });
                refresh();
              }}
            />
          ))}
        </ul>
      ) : null}

      {adding ? (
        <AddQualification
          types={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          onSaved={() => {
            refresh();
            setAdding(false);
          }}
          onCancel={items.length > 0 ? () => setAdding(false) : undefined}
          authed={authed}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="font-semibold text-emerald-800 underline">
          + Add another qualification
        </button>
      )}

      <Button type="button" disabled={items.length === 0} onClick={onDone}>
        Continue
      </Button>
    </div>
  );
}

function AddQualification({
  types,
  onSaved,
  onCancel,
  authed,
}: {
  types: { value: string; label: string }[];
  onSaved: () => void;
  onCancel?: () => void;
  authed: ReturnType<typeof useAuth>['authed'];
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({ resolver: zodResolver(qualificationSchema) });

  async function onSubmit(values: Output) {
    setFormError(null);
    try {
      await authed('/teachers/me/qualifications', { method: 'POST', body: values });
      onSaved();
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5 rounded-lg border border-slate-200 p-4">
      <Select
        key={`type-${types.length}`}
        label="Qualification"
        placeholder="Choose…"
        options={types}
        error={errors.qualificationTypeId?.message}
        {...register('qualificationTypeId')}
      />
      <Field label="Course" placeholder="e.g. Mathematics Education" error={errors.course?.message} {...register('course')} />
      <Field label="Institution" error={errors.institution?.message} {...register('institution')} />
      <Field
        label="Year obtained"
        type="number"
        inputMode="numeric"
        error={errors.yearObtained?.message}
        {...register('yearObtained', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
      />
      <div>
        <p className="mb-1 text-sm font-medium text-slate-800">Certificate (optional)</p>
        <FileUpload
          purpose="qualification_file"
          label={fileName ? `Replace ${fileName}` : 'Upload certificate'}
          onUploaded={async (uploadId, file) => {
            setValue('fileUploadId', uploadId);
            setFileName(file.name);
          }}
        />
      </div>
      {formError ? <Alert>{formError}</Alert> : null}
      <div className="flex gap-3">
        <Button type="submit" loading={isSubmitting}>
          Save qualification
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
