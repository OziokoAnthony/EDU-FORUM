'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { SMS_CATEGORIES, SMS_CATEGORY_LABELS, type NotificationPreferences, type SmsCategory, type SmsChannel } from '@edu-forum/shared';
import { Alert, Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { NOTIFICATIONS_KEY } from '@/lib/notifications';

const KEY = [...NOTIFICATIONS_KEY, 'preferences'];

/** SMS / WhatsApp alerts (user, 2026-11-01): important alerts only, opt-in, to a confirmed phone number. */
export function SmsSettings() {
  const { authed, reloadUser } = useAuth();
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: KEY, queryFn: () => authed<NotificationPreferences>('/notifications/preferences') });
  const [draft, setDraft] = useState<Record<SmsCategory, boolean> | null>(null);
  const [channel, setChannel] = useState<SmsChannel>('sms');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'code'>('idle');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!prefs.data) return;
    setDraft(prefs.data.sms);
    setChannel(prefs.data.smsChannel);
  }, [prefs.data]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof ApiError ? (Object.values(err.fieldErrors())[0] ?? err.message) : 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      await authed('/me', { method: 'PATCH', body: { phone } });
      setStep('code');
      setMsg({ kind: 'success', text: 'We sent a 6-digit code to your phone.' });
    });

  const confirm = () =>
    run(async () => {
      await authed('/auth/verify-phone', { method: 'POST', body: { phone, code } });
      await reloadUser();
      await qc.invalidateQueries({ queryKey: KEY });
      setStep('idle');
      setCode('');
      setMsg({ kind: 'success', text: 'Phone number confirmed.' });
    });

  const save = () =>
    run(async () => {
      const res = await authed<NotificationPreferences>('/notifications/preferences', { method: 'PUT', body: { sms: draft, smsChannel: channel } });
      qc.setQueryData(KEY, res);
      setMsg({ kind: 'success', text: 'Text alert choices saved.' });
    });

  const p = prefs.data;
  const input = 'rounded-md border border-slate-300 px-3 py-2';

  return (
    <section className="space-y-4 rounded-lg bg-panel p-4 shadow-sm sm:p-6" aria-labelledby="sms-title">
      <h2 id="sms-title" className="text-2xl text-slate-900">
        Text me (SMS or WhatsApp)
      </h2>
      <p className="text-sm text-slate-600">Only the important alerts, and only the ones you choose. Off unless you switch them on.</p>
      {!p || !draft ? (
        <p className="text-slate-500">Loading…</p>
      ) : !p.phone || !p.phoneVerified ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{p.phone ? `Confirm your phone number ${p.phone} to get text alerts.` : 'Add your phone number to get text alerts.'}</p>
          {step === 'idle' ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label htmlFor="sms-phone" className="block text-sm font-medium text-slate-800">
                  Phone number
                </label>
                <input id="sms-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
              </div>
              <Button type="button" loading={busy} disabled={phone.trim().length < 10} onClick={() => void sendCode()} className="sm:w-auto">
                Send code
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label htmlFor="sms-code" className="block text-sm font-medium text-slate-800">
                  6-digit code
                </label>
                <input id="sms-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${input} w-32`} />
              </div>
              <Button type="button" loading={busy} disabled={code.length !== 6} onClick={() => void confirm()} className="sm:w-auto">
                Confirm
              </Button>
              <button type="button" onClick={() => setStep('idle')} className="pb-2 text-sm font-semibold text-slate-600 underline">
                Change number
              </button>
            </div>
          )}
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="text-sm text-slate-700">Texts go to {p.phone}.</p>
          {SMS_CATEGORIES.map((c) => (
            <label key={c} className="flex items-start gap-3 text-base text-slate-800">
              <input type="checkbox" checked={draft[c]} onChange={(e) => setDraft({ ...draft, [c]: e.target.checked })} className="mt-1 h-5 w-5 shrink-0 accent-emerald-700" />
              <span>{SMS_CATEGORY_LABELS[c]}</span>
            </label>
          ))}
          <fieldset className="flex flex-wrap items-center gap-4 text-sm text-slate-800">
            <legend className="mb-1 font-medium">Send them by</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="sms-channel" checked={channel === 'sms'} onChange={() => setChannel('sms')} /> SMS
            </label>
            <label className={`flex items-center gap-2 ${p.whatsappAvailable ? '' : 'opacity-50'}`}>
              <input type="radio" name="sms-channel" disabled={!p.whatsappAvailable} checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} /> WhatsApp
              {!p.whatsappAvailable ? <span className="text-xs text-slate-500">(coming soon)</span> : null}
            </label>
          </fieldset>
          <Button type="submit" loading={busy} className="sm:w-auto">
            Save text alerts
          </Button>
        </form>
      )}
      {msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null}
    </section>
  );
}
