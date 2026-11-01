'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  COMMUNITY_COMMENT_MAX_CHARS,
  containsPhoneNumber,
  type CommunityAuthor,
  type CommunityCommentItem,
  type CommunityPostItem,
  type LikeResponse,
  type Paginated,
} from '@edu-forum/shared';
import { ReportButton } from '@/components/report-button';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { COMMUNITY_KEY } from './keys';

const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
};

function Avatar({ a }: { a: CommunityAuthor }) {
  return a.photoUrl ? (
    // Signed, short-lived URL from private storage: next/image cannot optimise it.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={a.photoUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" />
  ) : (
    <div aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-500">
      {a.name.charAt(0)}
    </div>
  );
}

function AuthorName({ a }: { a: CommunityAuthor }) {
  const badge = a.role === 'teacher' ? null : <span className="ml-2 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold">School leader</span>;
  return a.teacherId ? (
    <Link href={`/hiring/teachers/${a.teacherId}`} className="font-semibold text-emerald-800 underline">
      {a.name}
    </Link>
  ) : (
    <span className="font-semibold text-slate-900">
      {a.name}
      {badge}
    </span>
  );
}

function LikeButton({ liked, count, onToggle, busy, label }: { liked: boolean; count: number; onToggle: () => void; busy: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={`${liked ? 'Unlike' : 'Like'} ${label}`}
      disabled={busy}
      onClick={onToggle}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-60 ${liked ? 'bg-gold/15 text-gold' : 'text-slate-700 hover:bg-slate-100'}`}
    >
      <span aria-hidden>👍</span> {count > 0 ? count : ''} {liked ? 'Liked' : 'Like'}
    </button>
  );
}

/** One post: author, text, photos, shared job, like, comments, report/block/delete. */
export function PostCard({ post, area, startOpen = false }: { post: CommunityPostItem; area: 'teacher' | 'hiring'; startOpen?: boolean }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const patch = (changes: Partial<CommunityPostItem>) => qc.setQueriesData({ queryKey: COMMUNITY_KEY }, (data: unknown) => patchPost(data, post.id, changes));

  const like = () =>
    run(async () => {
      const res = await authed<LikeResponse>(`/community/posts/${post.id}/like`, { method: post.likedByMe ? 'DELETE' : 'POST' });
      patch({ likes: res.likes, likedByMe: res.likedByMe });
    });

  const remove = () =>
    window.confirm('Delete this post?') &&
    run(async () => {
      await authed(`/community/posts/${post.id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: COMMUNITY_KEY });
    });

  const block = () =>
    window.confirm(`Block ${post.author.name}? You will not see each other's posts or comments.`) &&
    run(async () => {
      await authed('/community/blocks', { method: 'POST', body: { userId: post.author.userId } });
      await qc.invalidateQueries({ queryKey: COMMUNITY_KEY });
    });

  return (
    <article className="space-y-3 rounded-md border border-slate-200 bg-panel p-4" aria-label={`Post by ${post.author.name}`}>
      <header className="flex items-start gap-3">
        <Avatar a={post.author} />
        <div className="min-w-0 flex-1">
          <AuthorName a={post.author} />
          <p className="text-xs text-slate-500">
            <Link href={`/${area}/community/${post.id}`} className="hover:underline">
              {ago(post.createdAt)}
            </Link>
            {post.tag ? (
              <>
                {' · '}
                <Link href={`/${area}/community?tag=${post.tag.slug}`} className="font-semibold text-emerald-800 hover:underline">
                  #{post.tag.name}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="relative">
          <button type="button" aria-label="Post options" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">
            ⋯
          </button>
          {menu ? (
            <div className="absolute right-0 z-10 mt-1 w-44 space-y-1 rounded-md border border-slate-200 bg-panel p-2 text-sm shadow-lg">
              {post.mine ? (
                <button type="button" onClick={remove} className="block w-full rounded px-2 py-1 text-left text-red-700 hover:bg-slate-100">
                  Delete post
                </button>
              ) : (
                <button type="button" onClick={block} className="block w-full rounded px-2 py-1 text-left text-slate-700 hover:bg-slate-100">
                  Block {post.author.name}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </header>

      {post.body ? <p className="whitespace-pre-line break-words text-slate-800">{post.body}</p> : null}

      {post.photos.length ? (
        <div className={`grid gap-1 ${post.photos.length > 1 ? 'grid-cols-2' : ''}`}>
          {post.photos.map((p) =>
            p.url ? (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="Photo in the post" loading="lazy" className="h-full w-full object-cover" />
              </a>
            ) : (
              <div key={p.id} className="flex aspect-[4/3] items-center justify-center rounded bg-slate-100 text-sm text-slate-500">
                Checking photo…
              </div>
            ),
          )}
        </div>
      ) : null}

      {post.job ? (
        <a href={post.job.path} className="lift block rounded-md border border-gold/50 bg-gold/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">Shared job{post.job.open ? '' : ' · closed'}</p>
          <p className="font-semibold text-slate-900">{post.job.title}</p>
          <p className="text-sm text-slate-600">
            {post.job.schoolLabel} · {post.job.place}
          </p>
          <p className="text-sm text-slate-600">
            {money(post.job.salary.min)} – {money(post.job.salary.max)} / {post.job.salary.period === 'monthly' ? 'month' : post.job.salary.period}
          </p>
        </a>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
        <LikeButton liked={post.likedByMe} count={post.likes} onToggle={() => void like()} busy={busy} label="post" />
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded-full px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          💬 {post.comments > 0 ? post.comments : ''} {post.comments === 1 ? 'Comment' : 'Comments'}
        </button>
        {!post.mine ? (
          <div className="ml-auto">
            <ReportButton targetType="community_post" targetId={post.id} />
          </div>
        ) : null}
      </footer>

      {open ? <Comments post={post} onCount={(comments) => patch({ comments })} /> : null}
    </article>
  );
}

function Comments({ post, onCount }: { post: CommunityPostItem; onCount: (n: number) => void }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const key = [...COMMUNITY_KEY, 'comments', post.id];
  const list = useQuery({ queryKey: key, queryFn: () => authed<Paginated<CommunityCommentItem>>(`/community/posts/${post.id}/comments?limit=50`) });
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phone = containsPhoneNumber(body);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || phone) return;
    setBusy(true);
    setError(null);
    try {
      await authed(`/community/posts/${post.id}/comments`, { method: 'POST', body: { body } });
      setBody('');
      const fresh = await qc.fetchQuery({ queryKey: key, queryFn: () => authed<Paginated<CommunityCommentItem>>(`/community/posts/${post.id}/comments?limit=50`) });
      onCount(fresh.meta.total);
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fieldErrors())[0] ?? err.message) : 'Could not post the comment.');
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      const fresh = await qc.fetchQuery({ queryKey: key, queryFn: () => authed<Paginated<CommunityCommentItem>>(`/community/posts/${post.id}/comments?limit=50`) });
      onCount(fresh.meta.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div className="space-y-3">
      {list.isPending ? (
        <p className="text-sm text-slate-500">Loading comments…</p>
      ) : list.isError ? (
        <Alert>{list.error.message}</Alert>
      ) : (
        <ul className="space-y-2">
          {list.data.data.map((c) => (
            <li key={c.id} className="flex gap-2">
              <Avatar a={c.author} />
              <div className="min-w-0 flex-1">
                <div className="rounded-md bg-slate-100 px-3 py-2">
                  <AuthorName a={c.author} />
                  <p className="whitespace-pre-line break-words text-sm text-slate-800">{c.body}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 px-1 pt-1 text-xs text-slate-500">
                  <span>{ago(c.createdAt)}</span>
                  <button
                    type="button"
                    aria-pressed={c.likedByMe}
                    onClick={() => void act(() => authed(`/community/comments/${c.id}/like`, { method: c.likedByMe ? 'DELETE' : 'POST' }))}
                    className={`font-semibold ${c.likedByMe ? 'text-gold' : 'text-slate-600'}`}
                  >
                    👍 {c.likes > 0 ? c.likes : ''} {c.likedByMe ? 'Liked' : 'Like'}
                  </button>
                  {c.mine ? (
                    <button type="button" onClick={() => window.confirm('Delete this comment?') && void act(() => authed(`/community/comments/${c.id}`, { method: 'DELETE' }))} className="text-red-700">
                      Delete
                    </button>
                  ) : (
                    <ReportButton targetType="community_comment" targetId={c.id} />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={send} className="space-y-1">
        <label htmlFor={`comment-${post.id}`} className="sr-only">
          Write a comment
        </label>
        <div className="flex gap-2">
          <textarea
            id={`comment-${post.id}`}
            rows={1}
            maxLength={COMMUNITY_COMMENT_MAX_CHARS}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment…"
            className="min-h-[44px] flex-1 rounded-md border border-slate-300 px-3 py-2"
          />
          <button type="submit" disabled={busy || !body.trim() || phone} className="rounded-md bg-emerald-700 px-4 font-semibold text-white disabled:opacity-50">
            Send
          </button>
        </div>
        {phone ? <p className="text-sm text-red-600">Please do not share phone numbers in the community. Use chat instead.</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </div>
  );
}

/** Updates one post wherever it sits in the cached feed pages or single-post queries. */
export function patchPost(data: unknown, id: string, changes: Partial<CommunityPostItem>): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = data as { pages?: { data: CommunityPostItem[] }[]; id?: string };
  if (Array.isArray(d.pages)) {
    return { ...d, pages: d.pages.map((p) => ({ ...p, data: p.data.map((x) => (x.id === id ? { ...x, ...changes } : x)) })) };
  }
  if (d.id === id) return { ...d, ...changes };
  return data;
}
