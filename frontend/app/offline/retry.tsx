'use client';

export function RetryButton() {
  return (
    <button type="button" onClick={() => window.location.reload()} className="rounded-md bg-emerald-700 px-5 py-2.5 font-semibold text-white hover:bg-emerald-600">
      Try again
    </button>
  );
}
