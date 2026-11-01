'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { WS_EVENTS, type ConversationItem, type Paginated } from '@edu-forum/shared';
import { Alert } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useSocketEvent } from '@/lib/realtime';

export const CONVERSATIONS_KEY = ['conversations'] as const;

export const chatTime = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString('en-NG', sameDay ? { hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short' });
};

/** The chat list; live: any new message refreshes it. */
export function ConversationList({ base, empty }: { base: '/teacher/messages' | '/hiring/messages'; empty: React.ReactNode }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: [...CONVERSATIONS_KEY, 'list'], queryFn: () => authed<Paginated<ConversationItem>>('/conversations?limit=50'), staleTime: 0 });
  useSocketEvent(WS_EVENTS.message, () => void qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY }));
  useSocketEvent(WS_EVENTS.conversationUpdated, () => void qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY }));

  if (list.isPending) return <p className="text-slate-500">Loading…</p>;
  if (list.isError) return <Alert>{list.error.message}</Alert>;
  if (list.data.data.length === 0) return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-600">{empty}</p>;

  return (
    <ul className="stagger divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-panel shadow-sm">
      {list.data.data.map((c) => (
        <li key={c.id}>
          <Link href={`${base}/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100  text-lg text-gold">
              {c.other.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className={`truncate ${c.unread ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>{c.other.name}</span>
                {c.lastMessage ? <span className="shrink-0 text-xs text-slate-500">{chatTime(c.lastMessage.at)}</span> : null}
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-slate-600">
                  {c.blocked ? 'Chat blocked' : c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.preview}` : 'No messages yet'}
                </span>
                {c.unread ? (
                  <span className="shrink-0 rounded-full bg-brand px-2 text-xs font-bold leading-5 text-white" aria-label={`${c.unread} unread`}>
                    {c.unread}
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
