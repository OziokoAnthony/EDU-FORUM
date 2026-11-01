'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';

/** Members download (user, 2026-11-01): signed-out visitors are asked to sign in or join free. */
export function DownloadButton(props: { id: string; path: string }) {
  return (
    <AuthProvider>
      <Inner {...props} />
    </AuthProvider>
  );
}

function Inner({ id, path }: { id: string; path: string }) {
  const { status, user, authed } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'loading') return <p className="text-sm text-slate-500">Checking your account…</p>;
  if (status !== 'signed-in' || !user?.verified) {
    return (
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="font-semibold text-slate-900">Free for members</p>
        <p className="text-sm text-slate-600">Sign in or create a free account to download this resource.</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/login?next=${encodeURIComponent(path)}`} className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-600">
            Sign in to download
          </Link>
          <Link href="/register" className="rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-white">
            Join free
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { url } = await authed<{ url: string }>(`/materials/${id}/download`);
            window.location.assign(url);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not start the download. Try again.');
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-md bg-emerald-700 px-5 py-2.5 font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
      >
        {busy ? 'Preparing…' : 'Download'}
      </button>
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}
