'use client';

import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  MESSAGE_MAX_CHARS,
  UPLOAD_RULES,
  WS_EVENTS,
  type AttachmentLinkResponse,
  type ConversationItem,
  type MessageItem,
  type MessagesPage,
} from '@edu-forum/shared';
import { ReportButton } from '@/components/report-button';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocketEvent } from '@/lib/realtime';
import { uploadFile, UploadError } from '@/lib/upload';
import { CONVERSATIONS_KEY, chatTime } from './conversations';

const ACCEPT = Object.keys(UPLOAD_RULES.message_attachment.mimeTypes).join(',');

/** One chat: messages (live), "Seen", attachments, delete own, block/unblock, report. */
export function ChatThread({ id, back }: { id: string; back: string }) {
  const { authed, user } = useAuth();
  const qc = useQueryClient();
  const convKey = [...CONVERSATIONS_KEY, id];
  const msgKey = [...CONVERSATIONS_KEY, id, 'messages'];
  const conv = useQuery({ queryKey: convKey, queryFn: () => authed<ConversationItem>(`/conversations/${id}`), staleTime: 0 });
  const messages = useInfiniteQuery({
    queryKey: msgKey,
    queryFn: ({ pageParam }) => authed<MessagesPage>(`/conversations/${id}/messages${pageParam ? `?before=${pageParam}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    staleTime: 0,
  });
  const bottom = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Pages arrive newest-first; each page is oldest-first inside.
  const all = (messages.data?.pages ?? []).slice().reverse().flatMap((p) => p.data);
  const lastId = all.at(-1)?.id;
  const unreadFromThem = all.some((m) => !m.mine && !m.readAt);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [lastId]);

  useEffect(() => {
    if (!unreadFromThem) return;
    void authed(`/conversations/${id}/read`, { method: 'POST', body: {} }).then(() => {
      void qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY, exact: false });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    });
  }, [unreadFromThem, lastId, id, authed, qc]);

  /** Insert or replace a message in the cached pages (live pushes and our own sends). */
  function upsert(m: MessageItem) {
    qc.setQueryData<InfiniteData<MessagesPage, string>>(msgKey, (data) => {
      if (!data) return data;
      const exists = data.pages.some((p) => p.data.some((x) => x.id === m.id));
      const pages = data.pages.map((p, i) =>
        exists ? { ...p, data: p.data.map((x) => (x.id === m.id ? m : x)) } : i === 0 ? { ...p, data: [...p.data, m] } : p,
      );
      return { ...data, pages };
    });
  }

  useSocketEvent<MessageItem>(WS_EVENTS.message, (m) => {
    if (m.conversationId === id) upsert(m);
  });
  useSocketEvent<{ conversationId: string; readAt: string }>(WS_EVENTS.conversationRead, (e) => {
    if (e.conversationId !== id) return;
    qc.setQueryData<InfiniteData<MessagesPage, string>>(msgKey, (data) =>
      data ? { ...data, pages: data.pages.map((p) => ({ ...p, data: p.data.map((m) => (m.mine && !m.readAt ? { ...m, readAt: e.readAt } : m)) })) } : data,
    );
  });
  useSocketEvent<{ conversationId: string }>(WS_EVENTS.conversationUpdated, (e) => {
    if (e.conversationId === id) void qc.invalidateQueries({ queryKey: convKey });
  });

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    }
  }

  if (conv.isPending) return <p className="px-4 py-10 text-center text-slate-500">Loading…</p>;
  if (conv.isError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Alert>This chat is not available.</Alert>
      </main>
    );
  }
  const c = conv.data;
  const lastMine = [...all].reverse().find((m) => m.mine && !m.deleted);

  return (
    <main className="mx-auto flex h-[calc(100dvh-5rem)] max-w-3xl flex-col px-2 py-3 sm:px-4">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-t-md border border-slate-200 bg-panel shadow-sm px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={back} aria-label="Back to messages" className="px-1 text-xl text-gold">
            ←
          </Link>
          <h1 className="truncate text-xl text-slate-900">
            {c.other.teacherId ? (
              <Link href={`/hiring/teachers/${c.other.teacherId}`} className="hover:text-gold">
                {c.other.name}
              </Link>
            ) : (
              c.other.name
            )}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {c.blocked === 'me' ? (
            <button type="button" className="font-semibold text-emerald-800 underline" onClick={() => void act(() => authed(`/conversations/${id}/unblock`, { method: 'POST', body: {} }).then(() => conv.refetch()))}>
              Unblock
            </button>
          ) : c.blocked === null ? (
            <button
              type="button"
              className="font-semibold text-slate-700 underline"
              onClick={() => {
                if (window.confirm(`Block ${c.other.name}? Neither of you can send messages until you unblock.`)) {
                  void act(() => authed(`/conversations/${id}/block`, { method: 'POST', body: {} }).then(() => conv.refetch()));
                }
              }}
            >
              Block
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto border-x border-slate-200 bg-page/60 px-3 py-3" aria-live="polite">
        {messages.hasNextPage ? (
          <div className="text-center">
            <button type="button" onClick={() => void messages.fetchNextPage()} disabled={messages.isFetchingNextPage} className="text-sm text-emerald-800 underline">
              {messages.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        ) : null}
        {messages.isPending ? <p className="text-center text-slate-500">Loading…</p> : null}
        {!messages.isPending && all.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">{user?.role === 'teacher' ? 'No messages yet.' : 'Say hello. Introduce your school and the role.'}</p>
        ) : null}
        {all.map((m) => (
          <Bubble key={m.id} m={m} conversationId={id} seen={m.id === lastMine?.id && !!m.readAt} onError={setError} onChange={upsert} />
        ))}
        <div ref={bottom} />
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {c.blocked ? (
        <p className="rounded-b-md border border-slate-200 bg-panel shadow-sm px-3 py-3 text-center text-sm text-slate-600">
          {c.blocked === 'me' ? 'You blocked this chat. Unblock to send messages.' : 'You cannot send messages in this chat.'}
        </p>
      ) : c.other.deleted ? (
        <p className="rounded-b-md border border-slate-200 bg-panel shadow-sm px-3 py-3 text-center text-sm text-slate-600">This account has been deleted.</p>
      ) : (
        <Composer id={id} onSent={upsert} onError={setError} />
      )}
    </main>
  );
}

function Bubble({
  m,
  conversationId,
  seen,
  onError,
  onChange,
}: {
  m: MessageItem;
  conversationId: string;
  seen: boolean;
  onError: (e: string | null) => void;
  onChange: (m: MessageItem) => void;
}) {
  const { authed } = useAuth();

  async function open() {
    onError(null);
    const tab = window.open('', '_blank');
    try {
      const link = await authed<AttachmentLinkResponse>(`/conversations/${conversationId}/messages/${m.id}/attachment`);
      if (tab) tab.location.href = link.url;
      else window.location.href = link.url;
    } catch (err) {
      tab?.close();
      onError(err instanceof ApiError ? err.message : 'Could not open the file.');
    }
  }

  async function remove() {
    if (!window.confirm('Delete this message? It will show as "Message deleted".')) return;
    try {
      onChange(await authed<MessageItem>(`/conversations/${conversationId}/messages/${m.id}`, { method: 'DELETE' }));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not delete the message.');
    }
  }

  return (
    <div className={`group flex animate-fade-up flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 ${
          m.deleted ? 'border border-dashed border-slate-300 text-slate-500 italic' : m.mine ? 'rounded-br-sm bg-emerald-700 text-white' : 'rounded-bl-sm bg-slate-100 text-slate-900'
        }`}
      >
        {m.deleted ? (
          'Message deleted'
        ) : (
          <>
            {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
            {m.attachment ? (
              m.attachment.status === 'ready' ? (
                <button type="button" onClick={() => void open()} className="mt-1 block text-left underline">
                  📎 {m.attachment.name} ({Math.max(1, Math.round(m.attachment.sizeBytes / 1024))} KB)
                </button>
              ) : (
                <p className="mt-1 text-sm opacity-80">
                  📎 {m.attachment.name} — {m.attachment.status === 'scanning' ? 'checking for viruses…' : 'file removed'}
                </p>
              )
            ) : null}
          </>
        )}
      </div>
      <p className="mt-0.5 flex items-center gap-2 px-1 text-xs text-slate-500">
        <span>{chatTime(m.createdAt)}</span>
        {seen ? <span className="text-gold">✓✓ Seen</span> : null}
        {m.mine && !m.deleted ? (
          <button type="button" onClick={() => void remove()} className="underline opacity-70 hover:opacity-100">
            Delete
          </button>
        ) : null}
        {!m.mine && !m.deleted ? <ReportButton targetType="message" targetId={m.id} /> : null}
      </p>
    </div>
  );
}

function Composer({ id, onSent, onError }: { id: string; onSent: (m: MessageItem) => void; onError: (e: string | null) => void }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !file) return;
    onError(null);
    setBusy(true);
    try {
      const uploadId = file ? await uploadFile(authed, 'message_attachment', file, setProgress) : undefined;
      const m = await authed<MessageItem>(`/conversations/${id}/messages`, { method: 'POST', body: { body: body.trim() || undefined, uploadId } });
      onSent(m);
      setBody('');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      void qc.invalidateQueries({ queryKey: [...CONVERSATIONS_KEY, 'list'] });
    } catch (err) {
      onError(err instanceof UploadError || err instanceof ApiError ? err.message : 'Could not send. Check your connection and try again.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={send} className="space-y-2 rounded-b-md border border-slate-200 bg-panel shadow-sm p-2">
      {file ? (
        <p className="flex items-center justify-between gap-2 px-1 text-sm text-slate-700">
          <span className="truncate">
            📎 {file.name}
            {progress !== null ? ` · ${progress}%` : ''}
          </span>
          <button
            type="button"
            className="underline"
            onClick={() => {
              setFile(null);
              if (fileInput.current) fileInput.current.value = '';
            }}
          >
            Remove
          </button>
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 text-xl text-gold hover:bg-slate-50" title="Attach a PDF or photo (5 MB max)">
          <span aria-hidden>📎</span>
          <span className="sr-only">Attach a file</span>
          <input ref={fileInput} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label htmlFor={`compose-${id}`} className="sr-only">
          Message
        </label>
        <textarea
          id={`compose-${id}`}
          rows={1}
          maxLength={MESSAGE_MAX_CHARS}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends on laptops; Shift+Enter adds a line. Phones use the Send button.
            if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
              e.preventDefault();
              void send(e);
            }
          }}
          placeholder="Write a message"
          className="block max-h-40 min-h-11 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-gold"
        />
        <button type="submit" disabled={busy || (!body.trim() && !file)} className="h-11 shrink-0 rounded-lg bg-emerald-700 px-4 font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">
          {busy ? '…' : 'Send'}
        </button>
      </div>
    </form>
  );
}
