'use client';

import { useState } from 'react';
import type { ScanStatus } from '@edu-forum/shared';
import { ApiError } from '@/lib/api';

/** A saved entry in a list step (qualification, certification, experience) with a Remove action. */
export function ItemCard({
  title,
  lines,
  onRemove,
}: {
  title: string;
  lines: (string | null | false | undefined)[];
  onRemove: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{title}</p>
          {lines.filter(Boolean).map((l) => (
            <p key={String(l)} className="text-sm text-slate-600">
              {l}
            </p>
          ))}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onRemove();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Could not remove. Try again.');
            } finally {
              setBusy(false);
            }
          }}
          className="shrink-0 text-sm font-semibold text-red-700 underline disabled:opacity-60"
        >
          Remove
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function fileStatusText(hasFile: boolean, status: ScanStatus | null): string | null {
  if (!hasFile) return null;
  return {
    pending: 'File: checking…',
    clean: 'File attached',
    infected: 'File rejected by our virus scan. Please upload another.',
    failed: 'File could not be checked. Please upload it again.',
  }[status ?? 'pending'];
}
