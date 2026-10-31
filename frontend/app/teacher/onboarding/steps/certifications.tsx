'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { certificationSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { FileUpload } from '@/components/file-upload';
import { Select } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';
import { useCertificationTypes } from '@/lib/meta';
import { useRefreshTeacher } from '@/lib/teacher';
import { fileStatusText, ItemCard } from './item-list';
import type { StepProps } from './types';

type Input = z.input<typeof certificationSchema>;
type Output = z.output<typeof certificationSchema>;

const REVIEW_LABEL = { pending: 'Awaiting review', verified: 'Verified', rejected: 'Rejected' } as const;

/** Optional step: TRCN and other professional certificates ("required where held"). */
export function CertificationsStep({ profile, onDone }: StepProps) {
  const { authed } = useAuth();
  const refresh = useRefreshTeacher();
  const types = useCertificationTypes();
  const items = profile.certifications;
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-6">
      <p className="text-slate-600">
        Add your TRCN registration and any other teaching certificates you hold. Skip this step if you have none.
      </p>
      {items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((c) => (
            <ItemCard
              key={c.id}
              title={c.certificationType.name}
              lines={[
                `${c.issuer} · No. ${c.number}`,
                c.issuedAt ? `Issued ${c.issuedAt}${c.expiresAt ? `, expires ${c.expiresAt}` : ''}` : null,
                fileStatusText(c.hasFile, c.fileScanStatus),
                REVIEW_LABEL[c.verificationStatus],
              ]}
              onRemove={async () => {
                await authed(`/teachers/me/certifications/${c.id}`, { method: 'DELETE' });
                refresh();
              }}
            />
          ))}
        </ul>
      ) : null}

      {adding ? (
        <AddCertification
          types={types.data ?? []}
          authed={authed}
          onSaved={() => {
            refresh();
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="font-semibold text-emerald-800 underline">
          + Add a certification
        </button>
      )}

      <Button type="button" onClick={onDone}>
        {items.length > 0 ? 'Continue' : 'Skip: I have none'}
      </Button>
    </div>
  );
}

function AddCertification({
  types,
  authed,
  onSaved,
  onCancel,
}: {
  types: { id: string; name: string; issuer: string | null }[];
  authed: ReturnType<typeof useAuth>['authed'];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({ resolver: zodResolver(certificationSchema) });

  async function onSubmit(values: Output) {
    setFormError(null);
    try {
      await authed('/teachers/me/certifications', { method: 'POST', body: values });
      onSaved();
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5 rounded-lg border border-slate-200 p-4">
      <Select
        key={`type-${types.length}`}
        label="Certification"
        placeholder="Choose…"
        options={types.map((t) => ({ value: t.id, label: t.name }))}
        error={errors.certificationTypeId?.message}
        {...register('certificationTypeId', {
          // Pre-fill the issuer for types that have a known one (e.g. TRCN).
          onChange: (e) => {
            const issuer = types.find((t) => t.id === e.target.value)?.issuer;
            if (issuer) setValue('issuer', issuer);
          },
        })}
      />
      <Field label="Issuer" error={errors.issuer?.message} {...register('issuer')} />
      <Field label="Registration / certificate number" error={errors.number?.message} {...register('number')} />
      <Field label="Issue date" type="date" error={errors.issuedAt?.message} {...register('issuedAt')} />
      <Field
        label="Expiry date (optional)"
        type="date"
        error={errors.expiresAt?.message}
        {...register('expiresAt', { setValueAs: (v) => v || undefined })}
      />
      <div>
        <p className="mb-1 text-sm font-medium text-slate-800">Certificate file</p>
        <FileUpload
          purpose="certification_file"
          label={fileName ? `Replace ${fileName}` : 'Upload certificate'}
          onUploaded={async (uploadId, file) => {
            setValue('fileUploadId', uploadId, { shouldValidate: true });
            setFileName(file.name);
          }}
        />
        {errors.fileUploadId ? <p className="text-sm text-red-600">{errors.fileUploadId.message}</p> : null}
      </div>
      {formError ? <Alert>{formError}</Alert> : null}
      <div className="flex gap-3">
        <Button type="submit" loading={isSubmitting}>
          Save certification
        </Button>
        <button type="button" onClick={onCancel} className="px-3 text-slate-600 underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
