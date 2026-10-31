'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Select, TextArea } from '@/components/form';
import { Alert, Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMyVacancies } from '@/lib/vacancies';

export const SENT_INVITATIONS_KEY = ['invitations', 'sent'] as const;

/** Teacher profile (hiring side): invite this teacher to apply to one of your live vacancies. */
export function InvitePanel({ teacherId, teacherName }: { teacherId: string; teacherName: string }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const live = useMyVacancies('published');
  const [open, setOpen] = useState(false);
  const [vacancyId, setVacancyId] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const vacancies = live.data?.data ?? [];

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!vacancyId) return setNotice({ kind: 'error', text: 'Choose a vacancy' });
    setBusy(true);
    setNotice(null);
    try {
      await authed('/invitations', { method: 'POST', body: { vacancyId, teacherId, message } });
      setNotice({ kind: 'success', text: `Invitation sent. ${teacherName} has been notified.` });
      setVacancyId('');
      setMessage('');
      setOpen(false);
      void qc.invalidateQueries({ queryKey: SENT_INVITATIONS_KEY });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not send the invitation. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-slate-200 bg-panel p-4">
      <h2 className="text-xl text-slate-900">Invite to apply</h2>
      {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}
      {live.isPending ? null : vacancies.length === 0 ? (
        <p className="text-sm text-slate-600">
          Publish a vacancy first, then invite teachers to apply.{' '}
          <Link href="/hiring/vacancies/new" className="font-semibold text-emerald-800 underline">
            Post a vacancy
          </Link>
        </p>
      ) : open ? (
        <form onSubmit={send} noValidate className="space-y-3">
          <Select
            label="Vacancy"
            id="invite-vacancy"
            placeholder="Choose…"
            value={vacancyId}
            onChange={(e) => setVacancyId(e.target.value)}
            options={vacancies.map((v) => ({ value: v.id, label: v.title }))}
          />
          <TextArea label="Message (optional)" id="invite-message" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
          <Button type="submit" loading={busy} className="sm:w-auto">
            Send invitation
          </Button>
        </form>
      ) : (
        <Button type="button" className="sm:w-auto" onClick={() => setOpen(true)}>
          Invite {teacherName} to apply
        </Button>
      )}
    </section>
  );
}
