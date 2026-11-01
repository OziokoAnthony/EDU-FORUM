'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ACCOUNT_DELETION_GRACE_DAYS, type DeletionScheduled } from '@edu-forum/shared';
import { Alert, Button, Field } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const CANCELLED_FLAG = 'edu-forum:deletion-cancelled';
const CONFIRM_WORD = 'DELETE';

/** Login sets this when signing in cancelled a pending deletion; the next page shows it once. */
export function rememberDeletionCancelled(): void {
  try {
    window.sessionStorage.setItem(CANCELLED_FLAG, '1');
  } catch {
    // Storage blocked: the notice is a nicety.
  }
}

export function DeletionCancelledNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(CANCELLED_FLAG)) {
        window.sessionStorage.removeItem(CANCELLED_FLAG);
        setShow(true);
      }
    } catch {
      // ignore
    }
  }, []);
  if (!show) return null;
  return (
    <div className="mx-auto max-w-3xl px-4 pt-4">
      <Alert kind="success">Welcome back. Signing in cancelled your account deletion, so your account and data are kept.</Alert>
    </div>
  );
}

/** Account page (teacher and hiring areas): download my data, delete my account. */
export function AccountSettings({ backHref }: { backHref: string }) {
  const { authed, user } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setExportError(null);
    try {
      const data = await authed<unknown>('/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edu-forum-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Could not prepare your data. Try again.');
    } finally {
      setDownloading(false);
    }
  }

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (confirm.trim().toUpperCase() !== CONFIRM_WORD) {
      setDeleteError(`Type ${CONFIRM_WORD} to confirm.`);
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await authed<DeletionScheduled>('/me', { method: 'DELETE' });
      const day = new Date(res.deletionScheduledFor).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
      // The API has signed this account out everywhere: a full reload drops the old session.
      window.location.assign(`/login?deleted=${encodeURIComponent(day)}`);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete the account. Try again.');
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-6">
      <Link href={backHref} className="text-sm text-emerald-800 underline">
        ← Back to dashboard
      </Link>
      <div>
        <h1 className="text-3xl text-slate-900">Account</h1>
        <p className="mt-1 text-slate-600">Signed in as {user?.email ?? user?.phone}</p>
      </div>

      <section aria-labelledby="export" className="space-y-3 rounded-lg border border-slate-200 bg-panel shadow-sm p-4">
        <h2 id="export" className="text-xl text-slate-900">
          Download my data
        </h2>
        <p className="text-slate-600">
          One file with everything your account holds: your details, profile, applications, invitations, interviews, messages, saved items and
          notifications. Links to your uploaded files inside it work for 10 minutes.
        </p>
        {exportError ? <Alert>{exportError}</Alert> : null}
        <Button type="button" loading={downloading} onClick={() => void download()} className="sm:w-auto">
          Download my data
        </Button>
      </section>

      <section aria-labelledby="delete" className="space-y-3 rounded-md border border-red-300 p-4">
        <h2 id="delete" className="text-xl text-red-700">
          Delete my account
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li>Your account is hidden straight away and you are signed out everywhere.</li>
          <li>
            After {ACCOUNT_DELETION_GRACE_DAYS} days your personal details and every file you uploaded are erased for good. Chats and applications
            stay for the other side, shown as “deleted user”.
          </li>
          <li>Changed your mind? Sign in within {ACCOUNT_DELETION_GRACE_DAYS} days and the deletion is cancelled.</li>
        </ul>
        <form onSubmit={remove} noValidate className="space-y-3">
          <Field
            label={`Type ${CONFIRM_WORD} to confirm`}
            id="confirm-delete"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {deleteError ? <Alert>{deleteError}</Alert> : null}
          <Button type="submit" loading={deleting} className="bg-red-700 hover:bg-red-600 sm:w-auto">
            Delete my account
          </Button>
        </form>
      </section>
    </main>
  );
}
