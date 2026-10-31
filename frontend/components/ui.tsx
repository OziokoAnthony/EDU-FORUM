import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { PhotoCollage, PhotoStrip } from './photo-collage';

export const Field = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }
>(function Field({ label, error, hint, id, ...props }, ref) {
  const inputId = id ?? props.name;
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 aria-[invalid=true]:border-red-500"
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export function Button({
  loading,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      disabled={loading || props.disabled}
      className={`inline-flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-600 disabled:opacity-60 ${className}`}
      {...props}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-slate-200 bg-slate-50 text-slate-700',
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  );
}

/**
 * Sign-in, sign-up, verify and reset pages: the form card rises in beside a photo collage
 * (teacher, principal, director, school, CV) on laptops, under a row of round photos on phones.
 */
export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[1fr_28rem] lg:py-10">
      <div className="hidden lg:block">
        <PhotoCollage />
      </div>
      <div className="space-y-4">
        <PhotoStrip />
        <div className="animate-fade-up rounded-md border border-slate-200 bg-panel p-6 shadow-xl shadow-black/30 sm:p-8">
          <h1 className="text-3xl text-slate-900">{title}</h1>
          <div className="mt-6 space-y-5">{children}</div>
          {footer ? <div className="mt-6 text-sm text-slate-600">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}
