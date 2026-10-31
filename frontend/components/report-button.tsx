'use client';

import { useState } from 'react';
import { REPORT_REASON_LABELS, REPORT_REASONS, type ReportTarget } from '@edu-forum/shared';
import { Select, TextArea } from '@/components/form';
import { Alert, Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** PRD POST /reports: lets anyone signed in flag a profile, vacancy or message for review. */
export function ReportButton({ targetType, targetId, label = 'Report' }: { targetType: ReportTarget; targetId: string; label?: string }) {
  const { authed } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (state?.kind === 'success') return <p className="text-sm text-slate-600">{state.text}</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-slate-600 underline">
        {label}
      </button>
    );
  }

  async function send() {
    if (!reason) return setState({ kind: 'error', text: 'Choose a reason' });
    setBusy(true);
    try {
      await authed('/reports', { method: 'POST', body: { targetType, targetId, reason, details } });
      setState({ kind: 'success', text: 'Thanks. Our team will review this.' });
    } catch (err) {
      setState({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not send the report. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
      <Select
        label="What is wrong?"
        name="reportReason"
        placeholder="Choose…"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        options={REPORT_REASONS.map((r) => ({ value: r, label: REPORT_REASON_LABELS[r] }))}
      />
      <TextArea label="Details (optional)" id="reportDetails" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      {state ? <Alert kind={state.kind}>{state.text}</Alert> : null}
      <div className="flex gap-3">
        <Button type="button" loading={busy} onClick={() => void send()}>
          Send report
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 text-slate-600 underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
