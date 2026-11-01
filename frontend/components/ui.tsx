import { APP_NAME } from '@edu-forum/shared';
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import Image from 'next/image';
import logoFull from '@/public/brand/logo.png';
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
 * Sign-in, sign-up, verify and reset pages, laid out like a social-network sign-in: the name and
 * a one-line promise (with the photo collage on laptops) beside a white card with the form.
 */
export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto grid w-full max-w-6xl items-start gap-6 px-4 py-6 lg:grid-cols-[1fr_26rem] lg:gap-12 lg:py-14">
      <div className="space-y-4 text-center lg:pt-6 lg:text-left">
        <Image src={logoFull} alt={APP_NAME} priority sizes="(min-width: 1024px) 420px, 280px" className="mx-auto h-auto w-[280px] mix-blend-multiply lg:mx-0 lg:w-[420px]" />
        <p className="text-lg text-slate-700 lg:text-2xl lg:leading-snug">Find teaching jobs and recruit teachers across Nigeria, free.</p>
        <div className="hidden lg:block">
          <PhotoCollage />
        </div>
        <PhotoStrip />
      </div>
      <div className="animate-fade-up rounded-lg bg-panel p-5 shadow-[0_2px_4px_rgb(0_0_0/0.1),0_8px_16px_rgb(0_0_0/0.1)] sm:p-6">
        <h1 className="text-2xl text-slate-900">{title}</h1>
        <div className="mt-5 space-y-5">{children}</div>
        {footer ? <div className="mt-6 border-t border-slate-200 pt-4 text-sm text-slate-600">{footer}</div> : null}
      </div>
    </main>
  );
}
