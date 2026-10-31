'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { GENDER_LABELS, GENDERS, personalSchema, type TeacherProfileResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import { FileUpload } from '@/components/file-upload';
import { Select, TextArea } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';
import { useRefreshTeacher } from '@/lib/teacher';
import type { StepProps } from './types';

type Input = z.input<typeof personalSchema>;
type Output = z.output<typeof personalSchema>;

export function PersonalStep({ profile, onDone }: StepProps) {
  const { authed } = useAuth();
  const refresh = useRefreshTeacher();
  const [formError, setFormError] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(personalSchema),
    defaultValues: {
      fullName: profile.fullName ?? '',
      gender: profile.gender ?? undefined,
      dob: profile.dob ?? '',
      bio: profile.bio ?? '',
    },
  });

  async function onSubmit(values: Output) {
    setFormError(null);
    try {
      refresh(await authed<TeacherProfileResponse>('/teachers/me/personal', { method: 'PATCH', body: values }));
      onDone();
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  async function onPhoto(uploadId: string) {
    const res = await authed<{ scanStatus: string }>('/teachers/me/photo', { method: 'POST', body: { uploadId } });
    setPhotoNote(res.scanStatus === 'clean' ? 'Photo updated.' : 'Photo uploaded. It appears once our safety check finishes.');
    refresh();
  }

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-4">
        {profile.photoUrl ? (
          // Signed, short-lived URL from private storage: next/image cannot optimise it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.photoUrl} alt="Your profile photo" width={72} height={72} className="h-18 w-18 rounded-full object-cover" />
        ) : (
          <div className="flex h-18 w-18 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500">No photo</div>
        )}
        <div>
          <FileUpload purpose="profile_photo" label={profile.photoUrl ? 'Change photo' : 'Add a photo (optional)'} onUploaded={onPhoto} />
          {photoNote ? <p className="text-sm text-emerald-800">{photoNote}</p> : null}
        </div>
      </section>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Field label="Full name" autoComplete="name" error={errors.fullName?.message} {...register('fullName')} />
        <Select
          label="Gender"
          placeholder="Choose…"
          options={GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g] }))}
          error={errors.gender?.message}
          {...register('gender')}
        />
        <Field label="Date of birth" type="date" autoComplete="bday" error={errors.dob?.message} {...register('dob')} />
        <Field
          id="phone"
          label="Phone number"
          value={profile.phone ?? ''}
          readOnly
          disabled
          hint="From your account. Schools only see it after they shortlist you."
        />
        <TextArea label="Short bio (optional)" maxLength={1000} error={errors.bio?.message} {...register('bio')} />
        {formError ? <Alert>{formError}</Alert> : null}
        <Button type="submit" loading={isSubmitting}>
          Save and continue
        </Button>
      </form>
    </div>
  );
}
