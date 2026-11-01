'use client';

import type { PushPublicKeyResponse } from '@edu-forum/shared';
import { api } from './api';

type Authed = <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;

export type PushState = 'unsupported' | 'unavailable' | 'denied' | 'off' | 'on';

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  // The service worker is registered on every page in production; make sure it exists here too.
  return (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
}

/** Where push alerts stand on this device. */
export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const { publicKey } = await api<PushPublicKeyResponse>('/push/public-key');
  if (!publicKey) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Ask permission, subscribe this device and tell the API. */
export async function enablePush(authed: Authed): Promise<PushState> {
  const { publicKey } = await api<PushPublicKeyResponse>('/push/public-key');
  if (!publicKey) return 'unavailable';
  if ((await Notification.requestPermission()) !== 'granted') return Notification.permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  if (!reg) return 'unsupported';
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  await authed('/me/push-subscriptions', { method: 'POST', body: sub.toJSON() });
  return 'on';
}

/** Stop alerts on this device (also used when signing out, so a shared phone stops getting them). */
export async function disablePush(authed: Authed): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await authed('/me/push-subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return 'off';
}
