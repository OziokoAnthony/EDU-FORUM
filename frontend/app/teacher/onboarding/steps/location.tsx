'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { locationSchema, type TeacherProfileResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import { Checkbox, ChipGroup, SecondaryButton, Select } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';
import { useLgas, useStates } from '@/lib/meta';
import { useRefreshTeacher } from '@/lib/teacher';
import type { StepProps } from './types';

// Leaflet is ~150 KB: only downloaded when the teacher opens the map.
const MapPin = dynamic(() => import('@/components/map-pin'), {
  ssr: false,
  loading: () => <p className="text-sm text-slate-500">Loading map…</p>,
});

type Input = z.input<typeof locationSchema>;
type Output = z.output<typeof locationSchema>;

export function LocationStep({ profile, onDone }: StepProps) {
  const { authed } = useAuth();
  const refresh = useRefreshTeacher();
  const [formError, setFormError] = useState<string | null>(null);
  const loc = profile.location;
  const [showMap, setShowMap] = useState(loc.lat != null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      countryCode: 'NG',
      stateId: loc.state?.id ?? '',
      lgaId: loc.lga?.id ?? '',
      area: loc.area ?? '',
      addressLine: loc.addressLine ?? '',
      lat: loc.lat,
      lng: loc.lng,
      willingToRelocate: profile.willingToRelocate,
      preferredStates: profile.preferredStates,
    },
  });
  const states = useStates();
  const stateId = watch('stateId');
  const lgas = useLgas(stateId || undefined);
  const [lat, lng] = [watch('lat'), watch('lng')];

  async function onSubmit(values: Output) {
    setFormError(null);
    try {
      refresh(await authed<TeacherProfileResponse>('/teachers/me/location', { method: 'PUT', body: values }));
      onDone();
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Field id="country" label="Country" value="Nigeria" readOnly disabled />
      {/* Remount once options arrive so the saved value is selected (options load async). */}
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
      <Field label="Area (optional)" placeholder="e.g. Allen Avenue" error={errors.area?.message} {...register('area')} />
      <Field
        label="Street address (optional)"
        autoComplete="street-address"
        hint="Private: schools never see your street or map pin, only your LGA and distance."
        error={errors.addressLine?.message}
        {...register('addressLine')}
      />

      <div className="space-y-2">
        {showMap ? (
          <>
            <p className="text-sm font-medium text-slate-800">Map pin (optional): tap where you live</p>
            <MapPin
              value={lat != null && lng != null ? { lat, lng } : null}
              onChange={(v) => {
                setValue('lat', v.lat);
                setValue('lng', v.lng);
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
          </>
        ) : (
          <SecondaryButton onClick={() => setShowMap(true)}>Add a map pin (optional)</SecondaryButton>
        )}
        <p className="text-sm text-slate-500">A pin makes distance search more accurate for you.</p>
      </div>

      <Checkbox label="I am willing to relocate" {...register('willingToRelocate')} />
      {watch('willingToRelocate') ? (
        <Controller
          control={control}
          name="preferredStates"
          render={({ field }) => (
            <ChipGroup
              label="Preferred states"
              options={(states.data ?? []).map((s) => ({ value: s.slug, label: s.name }))}
              value={field.value ?? []}
              onChange={field.onChange}
              error={errors.preferredStates?.message}
            />
          )}
        />
      ) : null}

      {formError ? <Alert>{formError}</Alert> : null}
      <Button type="submit" loading={isSubmitting}>
        Save and continue
      </Button>
    </form>
  );
}
