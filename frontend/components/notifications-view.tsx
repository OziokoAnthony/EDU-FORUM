'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationCategory,
  type NotificationItem,
  type NotificationPreferences,
  type Paginated,
} from '@edu-forum/shared';
import { Alert, Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { PushSettings } from '@/components/pwa/push-settings';
import { NOTIFICATIONS_KEY, UNREAD_KEY } from '@/lib/notifications';

const timeAgo = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
};

/** Notifications list (teacher and hiring areas) plus the email preferences. */
export function NotificationsView({ backHref }: { backHref: string }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const list = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'list'],
    queryFn: () => authed<Paginated<NotificationItem>>('/notifications?limit=50'),
    staleTime: 0,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

  const readAll = useMutation({
    mutationFn: () => authed('/notifications/read-all', { method: 'POST', body: {} }),
    onSuccess: () => {
      qc.setQueryData(UNREAD_KEY, { count: 0 });
      void refresh();
    },
  });

  async function open(n: NotificationItem) {
    if (!n.read) await authed(`/notifications/${n.id}/read`, { method: 'POST', body: {} }).catch(() => undefined);
    void refresh();
    if (n.link) router.push(n.link);
  }

  const items = list.data?.data ?? [];
  const unread = items.filter((n) => !n.read).length;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link href={backHref} className="text-sm text-emerald-800 underline">
        ← Back to dashboard
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl text-slate-900">Notifications</h1>
        {unread ? (
          <button type="button" onClick={() => readAll.mutate()} className="text-sm font-semibold text-emerald-800 underline">
            Mark all as read
          </button>
        ) : null}
      </div>

      {list.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : list.isError ? (
        <Alert>{list.error.message}</Alert>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-600">No notifications yet.</p>
      ) : (
        <ul className="stagger divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-panel shadow-sm">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void open(n)}
                className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-emerald-50/60'}`}
              >
                <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-gold'}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block ${n.read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>
                    {n.title}
                    {n.read ? null : <span className="sr-only"> (unread)</span>}
                  </span>
                  <span className="block text-sm text-slate-600">{n.body}</span>
                  <span className="block text-xs text-slate-500">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <PushSettings />
      <EmailPreferences />
    </main>
  );
}

function EmailPreferences() {
  const { authed } = useAuth();
  const prefs = useQuery({ queryKey: [...NOTIFICATIONS_KEY, 'preferences'], queryFn: () => authed<NotificationPreferences>('/notifications/preferences') });
  const [draft, setDraft] = useState<Record<NotificationCategory, boolean> | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (prefs.data) setDraft(prefs.data.email);
  }, [prefs.data]);

  const save = useMutation({
    mutationFn: (email: Record<NotificationCategory, boolean>) => authed<NotificationPreferences>('/notifications/preferences', { method: 'PUT', body: { email } }),
    onSuccess: () => setSaved(true),
  });

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-panel shadow-sm p-4 sm:p-6">
      <h2 className="text-2xl text-slate-900">Email me about</h2>
      <p className="text-sm text-slate-600">You always see notifications here. Account notices from our team are always emailed.</p>
      {draft ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            save.mutate(draft);
          }}
        >
          {NOTIFICATION_CATEGORIES.map((c) => (
            <label key={c} className="flex items-start gap-3 text-base text-slate-800">
              <input
                type="checkbox"
                checked={draft[c]}
                onChange={(e) => {
                  setSaved(false);
                  setDraft({ ...draft, [c]: e.target.checked });
                }}
                className="mt-1 h-5 w-5 shrink-0 accent-emerald-700"
              />
              <span>{NOTIFICATION_CATEGORY_LABELS[c]}</span>
            </label>
          ))}
          {save.isError ? <Alert>{save.error.message}</Alert> : null}
          {saved ? <Alert kind="success">Email preferences saved.</Alert> : null}
          <Button type="submit" loading={save.isPending} className="sm:w-auto">
            Save email preferences
          </Button>
        </form>
      ) : (
        <p className="text-slate-500">Loading…</p>
      )}
    </section>
  );
}
