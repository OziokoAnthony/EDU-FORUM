'use client';

import { useEffect, useState } from 'react';
import { BellIcon } from '@/components/icons';
import { Alert } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';

const TEXT: Record<PushState, string> = {
  on: 'Alerts are on for this device. You will get new messages, application updates, invitations and job alerts even when the app is closed.',
  off: 'Get an alert on this phone or computer for new messages, application updates, invitations and job alerts, even when the app is closed.',
  denied: 'Alerts are blocked for this site in your browser settings. Allow notifications for this site there, then come back.',
  unsupported: 'This browser cannot show alerts. On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then open it from there.',
  unavailable: 'Phone and browser alerts are not set up on this server yet.',
};

/** "Alerts on this device": push notifications on or off for the current browser or installed app. */
export function PushSettings() {
  const { authed } = useAuth();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState('unavailable'));
  }, []);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      setState(state === 'on' ? await disablePush(authed) : await enablePush(authed));
    } catch {
      setError('Could not change alerts on this device. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg bg-panel p-4 shadow-sm sm:p-6" aria-labelledby="push-title">
      <h2 id="push-title" className="flex items-center gap-2 text-2xl text-slate-900">
        <BellIcon className="h-6 w-6 text-brand" /> Alerts on this device
      </h2>
      <p className="text-sm text-slate-600">{state ? TEXT[state] : 'Checking…'}</p>
      {state === 'on' || state === 'off' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggle()}
          className={`rounded-md px-4 py-2 font-semibold disabled:opacity-60 ${state === 'on' ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-emerald-700 text-white hover:bg-emerald-600'}`}
        >
          {busy ? 'Please wait…' : state === 'on' ? 'Turn off alerts on this device' : 'Turn on alerts'}
        </button>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
    </section>
  );
}
