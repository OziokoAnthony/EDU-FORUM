'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { AdminAdSlot } from '@edu-forum/shared';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AdminNav } from '../admin-nav';

const CLIENT = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? '').trim();

/** Ad spaces: each starts off; switch it on with the AdSense slot ID from the ad unit's code. */
export default function Page() {
  const { authed } = useAuth();
  const slots = useQuery({ queryKey: ['admin-ads'], queryFn: () => authed<AdminAdSlot[]>('/admin/ads') });
  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <AdminNav current="ads" />
      <h1 className="text-2xl text-slate-900">Ads</h1>
      {CLIENT ? (
        <Alert kind="info">
          AdSense publisher ID: <strong>{CLIENT}</strong>. Visitors see Google&apos;s consent message first; ads show only on public pages.
        </Alert>
      ) : (
        <Alert kind="info">
          No AdSense publisher ID yet, so no ads show anywhere and no Google script loads. When your AdSense account is approved, put the ID (ca-pub-…) in{' '}
          <code>NEXT_PUBLIC_ADSENSE_CLIENT</code> and rebuild the site. You can prepare the spaces below now.
        </Alert>
      )}
      {slots.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : slots.isError ? (
        <Alert>{slots.error.message}</Alert>
      ) : (
        <ul className="space-y-3">
          {slots.data.map((s) => (
            <SlotRow key={`${s.pageType}/${s.slotName}`} slot={s} />
          ))}
        </ul>
      )}
    </main>
  );
}

function SlotRow({ slot }: { slot: AdminAdSlot }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(slot.enabled);
  const [slotId, setSlotId] = useState(slot.slotId ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const id = `${slot.pageType}-${slot.slotName}`;
  const changed = enabled !== slot.enabled || slotId !== (slot.slotId ?? '');

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await authed(`/admin/ads/${slot.pageType}/${slot.slotName}`, { method: 'PUT', body: { enabled, slotId: slotId.trim() || null } });
      await qc.invalidateQueries({ queryKey: ['admin-ads'] });
      setMsg({ kind: 'success', text: enabled ? 'Saved: this space is on.' : 'Saved: this space is off.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof ApiError ? (Object.values(err.fieldErrors())[0] ?? err.message) : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-3 rounded-lg bg-panel p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">{slot.label}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${slot.enabled ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{slot.enabled ? 'On' : 'Off'}</span>
      </div>
      <p className="text-xs text-slate-500">Reserved height {slot.height}px, so the page does not move when the ad loads.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor={`${id}-slot`} className="block text-sm font-medium text-slate-800">
            AdSense slot ID
          </label>
          <input id={`${id}-slot`} value={slotId} onChange={(e) => setSlotId(e.target.value)} inputMode="numeric" placeholder="e.g. 1234567890" className="w-48 rounded-md border border-slate-300 px-3 py-2" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5" />
          Show ads here
        </label>
        <button type="button" disabled={busy || !changed} onClick={() => void save()} className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null}
    </li>
  );
}
