'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const control =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 aria-[invalid=true]:border-red-500';

function Message({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p id={`${id}-error`} className="text-sm text-red-600">
        {error}
      </p>
    );
  }
  return hint ? (
    <p id={`${id}-hint`} className="text-sm text-slate-500">
      {hint}
    </p>
  ) : null;
}

const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & {
    label: string;
    error?: string;
    hint?: string;
    placeholder?: string;
    options: { value: string; label: string }[];
  }
>(function Select({ label, error, hint, placeholder, options, id, ...props }, ref) {
  const selectId = id ?? props.name!;
  return (
    <div className="space-y-1">
      <label htmlFor={selectId} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <select ref={ref} id={selectId} aria-invalid={!!error} aria-describedby={describedBy(selectId, error, hint)} className={control} {...props}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Message id={selectId} error={error} hint={hint} />
    </div>
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }
>(function TextArea({ label, error, hint, id, ...props }, ref) {
  const areaId = id ?? props.name!;
  return (
    <div className="space-y-1">
      <label htmlFor={areaId} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <textarea ref={ref} id={areaId} rows={4} aria-invalid={!!error} aria-describedby={describedBy(areaId, error, hint)} className={control} {...props} />
      <Message id={areaId} error={error} hint={hint} />
    </div>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }>(
  function Checkbox({ label, id, ...props }, ref) {
    const boxId = id ?? props.name!;
    return (
      <label htmlFor={boxId} className="flex items-start gap-3 text-base text-slate-800">
        <input ref={ref} id={boxId} type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-emerald-700" {...props} />
        <span>{label}</span>
      </label>
    );
  },
);

/** Multi-select as tappable chips (big touch targets on phones). */
export function ChipGroup({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
}) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-800">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o.value)}
              className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 bg-white text-slate-800'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </fieldset>
  );
}

export function SecondaryButton({ className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}
