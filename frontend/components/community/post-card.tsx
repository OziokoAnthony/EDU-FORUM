'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  COMMUNITY_COMMENT_MAX_CHARS,
  COMMUNITY_WS_EVENTS,
  containsPhoneNumber,
  type CommunityAuthor,
  type CommunityCommentItem,
  type CommunityPhotoItem,
  type CommunityPostItem,
  type CommunitySharedBlog,
  type CommunitySharedJob,
  type CommunitySharedPost,
  type LikeResponse,
  type Paginated,
} from '@edu-forum/shared';
import { ChevronIcon, CloseIcon, CommentIcon, DotsIcon, ShareIcon, ThumbIcon } from '@/components/icons';
import { Portal } from '@/components/portal';
import { ReportButton } from '@/components/report-button';
import { Alert } from '@/components/ui';
import { API_URL, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { useSocketEvent } from '@/lib/realtime';
import { COMMUNITY_KEY } from './keys';

export const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
};

export function Avatar({ a, size = 'h-10 w-10' }: { a: Pick<CommunityAuthor, 'name' | 'photoUrl'>; size?: string }) {
  return a.photoUrl ? (
    // Signed, short-lived URL from private storage: next/image cannot optimise it.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={a.photoUrl} alt="" width={40} height={40} className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <div aria-hidden className={`${size} flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600`}>
      {a.name.charAt(0)}
    </div>
  );
}

function AuthorName({ a }: { a: CommunityAuthor }) {
  const badge = a.role === 'teacher' ? null : <span className="ml-1.5 rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand">School leader</span>;
  return a.teacherId ? (
    <Link href={`/hiring/teachers/${a.teacherId}`} className="font-semibold text-slate-900 hover:underline">
      {a.name}
    </Link>
  ) : (
    <span className="font-semibold text-slate-900">
      {a.name}
      {badge}
    </span>
  );
}

// ───────────── photos ─────────────

/** 1 photo full width; 2 side by side; 3 = one big + two; 4 = a 2×2 grid. */
export function PhotoGrid({ photos, onOpen }: { photos: CommunityPhotoItem[]; onOpen: (index: number) => void }) {
  if (!photos.length) return null;
  const n = photos.length;
  const cell = (p: CommunityPhotoItem, i: number, extra = '') =>
    p.url ? (
      <button key={p.id} type="button" onClick={() => onOpen(i)} aria-label={`Open photo ${i + 1} of ${n}`} className={`block overflow-hidden bg-slate-100 ${extra}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]" />
      </button>
    ) : (
      <div key={p.id} className={`flex items-center justify-center bg-slate-100 text-sm text-slate-500 ${extra}`}>
        Checking photo…
      </div>
    );
  if (n === 1) return <div className="aspect-[4/3] w-full">{cell(photos[0], 0, 'h-full w-full')}</div>;
  if (n === 3) {
    return (
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5">
        {cell(photos[0], 0, 'row-span-2 h-full')}
        {cell(photos[1], 1, 'h-full')}
        {cell(photos[2], 2, 'h-full')}
      </div>
    );
  }
  return <div className={`grid gap-0.5 ${n === 2 ? 'aspect-[2/1] grid-cols-2' : 'aspect-square grid-cols-2 grid-rows-2'}`}>{photos.map((p, i) => cell(p, i, 'h-full'))}</div>;
}

/** Full-screen photo viewer: arrows, swipe, keyboard (←/→/Esc). */
export function Lightbox({ photos, start, onClose }: { photos: CommunityPhotoItem[]; start: number; onClose: () => void }) {
  const ready = photos.filter((p) => p.url);
  const [i, setI] = useState(Math.max(0, ready.findIndex((p) => p.id === photos[start]?.id)));
  const touch = useRef<number | null>(null);
  const go = (d: number) => setI((x) => (x + d + ready.length) % ready.length);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
    };
  });
  if (!ready.length) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/95"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ready[i].url!} alt={`Photo ${i + 1} of ${ready.length}`} className="max-h-full max-w-full object-contain" />
      <button type="button" onClick={onClose} aria-label="Close photo viewer" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
        <CloseIcon />
      </button>
      {ready.length > 1 ? (
        <>
          <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
            <ChevronIcon dir="left" />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
            <ChevronIcon />
          </button>
          <p className="absolute bottom-4 rounded-full bg-white/15 px-3 py-1 text-sm text-white">
            {i + 1} / {ready.length}
          </p>
        </>
      ) : null}
    </div>
  );
}

function Photos({ photos }: { photos: CommunityPhotoItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <PhotoGrid photos={photos} onOpen={setOpen} />
      {open !== null ? (
        <Portal>
          <Lightbox photos={photos} start={open} onClose={() => setOpen(null)} />
        </Portal>
      ) : null}
    </>
  );
}

function BlogCard({ blog }: { blog: CommunitySharedBlog }) {
  return (
    <a href={blog.path} className="block border-y border-slate-200 bg-slate-50 hover:bg-slate-100">
      {blog.hasCover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${API_URL}/posts/${blog.id}/cover`} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
      ) : null}
      <div className="px-4 py-3">
        <p className="text-xs font-semibold uppercase text-slate-500">From the blog</p>
        <p className="font-semibold text-slate-900">{blog.title}</p>
        <p className="line-clamp-2 text-sm text-slate-600">{blog.excerpt}</p>
      </div>
    </a>
  );
}

function JobCard({ job }: { job: CommunitySharedJob }) {
  return (
    <a href={job.path} className="block border-y border-slate-200 bg-slate-50 px-4 py-3 hover:bg-slate-100">
      <p className="text-xs font-semibold uppercase text-slate-500">Shared job{job.open ? '' : ' · closed'}</p>
      <p className="font-semibold text-slate-900">{job.title}</p>
      <p className="text-sm text-slate-600">
        {job.schoolLabel} · {job.place}
      </p>
      <p className="text-sm text-slate-600">
        {money(job.salary.min)} – {money(job.salary.max)} / {job.salary.period === 'monthly' ? 'month' : job.salary.period}
      </p>
    </a>
  );
}

/** The original post inside a share. */
function SharedBox({ shared, area }: { shared: CommunitySharedPost; area: 'teacher' | 'hiring' }) {
  if (!shared.available) {
    return (
      <div className="mx-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">This post is no longer available</p>
        <p>It was deleted or removed.</p>
      </div>
    );
  }
  return (
    <div className="mx-4 overflow-hidden rounded-lg border border-slate-200">
      <PostBody photos={shared.photos} job={shared.job} body={shared.body} />
      <div className="flex items-center gap-2 px-3 py-2">
        <Avatar a={shared.author} size="h-8 w-8" />
        <div className="min-w-0 text-sm">
          <AuthorName a={shared.author} />
          <p className="text-xs text-slate-500">
            <Link href={`/${area}/community/${shared.id}`} className="hover:underline">
              {ago(shared.createdAt)}
            </Link>
            {shared.tag ? ` · #${shared.tag.name}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

function PostBody({ body, photos, job }: { body: string; photos: CommunityPhotoItem[]; job: CommunitySharedJob | null }) {
  return (
    <>
      {body ? <p className={`whitespace-pre-line break-words px-4 pb-3 text-slate-900 ${!photos.length && !job && body.length < 80 ? 'text-2xl' : ''}`}>{body}</p> : null}
      {photos.length ? <Photos photos={photos} /> : null}
      {job ? <JobCard job={job} /> : null}
    </>
  );
}

// ───────────── the post ─────────────

/** One post: author, text, photos, shared job or post, counts, Like / Comment / Share. */
export function PostCard({ post, area, startOpen = false }: { post: CommunityPostItem; area: 'teacher' | 'hiring'; startOpen?: boolean }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [focus, setFocus] = useState(0);

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

  // Share the original when this post is itself a share.
  const shareId = post.shared?.available ? post.shared.id : post.shared ? null : post.id;
  const btn = 'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-[15px] font-semibold hover:bg-slate-100 disabled:opacity-60';
  const action = `${btn} text-slate-600`;

  return (
    <article className="rounded-lg bg-panel shadow-sm" aria-label={`Post by ${post.author.name}`}>
      <header className="flex items-start gap-2.5 px-4 pb-2 pt-3">
        <Avatar a={post.author} />
        <div className="min-w-0 flex-1">
          <AuthorName a={post.author} />
          {post.shared ? <span className="text-slate-600"> shared a post</span> : null}
          <p className="text-[13px] text-slate-500">
            <Link href={`/${area}/community/${post.id}`} className="hover:underline">
              {ago(post.createdAt)}
            </Link>
            {post.tag ? (
              <>
                {' · '}
                <Link href={`/${area}/community?tag=${post.tag.slug}`} className="font-semibold text-slate-600 hover:underline">
                  #{post.tag.name}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="relative">
          <button type="button" aria-label="Post options" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
            <DotsIcon className="h-5 w-5" />
          </button>
          {menu ? (
            <div className="absolute right-0 z-10 mt-1 w-72 animate-scale-in space-y-1 rounded-lg border border-slate-200 bg-panel p-2 text-sm shadow-xl">
              {post.mine ? (
                <button type="button" onClick={remove} className="block w-full rounded-md px-3 py-2 text-left font-semibold text-red-700 hover:bg-slate-100">
                  Delete post
                </button>
              ) : (
                <>
                  <button type="button" onClick={block} className="block w-full rounded-md px-3 py-2 text-left font-semibold text-slate-800 hover:bg-slate-100">
                    Block {post.author.name}
                  </button>
                  <div className="px-3 py-2">
                    <ReportButton targetType="community_post" targetId={post.id} label="Report post" />
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </header>

      <PostBody body={post.body} photos={post.photos} job={post.job} />
      {post.blog ? <BlogCard blog={post.blog} /> : null}
      {post.shared ? <SharedBox shared={post.shared} area={area} /> : null}
      {error ? (
        <div className="px-4 pt-2">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {post.likes || post.comments || post.shares ? (
        <div className="flex items-center justify-between gap-2 px-4 pt-2.5 text-[15px] text-slate-500">
          <span>
            {post.likes ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-brand text-white">
                  <ThumbIcon filled className="h-2.5 w-2.5" />
                </span>
                <span aria-label={`${post.likes} ${post.likes === 1 ? 'like' : 'likes'}`}>{post.likes}</span>
              </span>
            ) : null}
          </span>
          <span className="flex gap-3">
            {post.comments ? (
              <button type="button" onClick={() => setOpen((o) => !o)} className="hover:underline">
                {post.comments} {post.comments === 1 ? 'comment' : 'comments'}
              </button>
            ) : null}
            {post.shares ? (
              <span>
                {post.shares} {post.shares === 1 ? 'share' : 'shares'}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}

      <footer className="mx-4 mt-2 flex gap-1 border-t border-slate-200 py-1">
        <button type="button" aria-pressed={post.likedByMe} aria-label={post.likedByMe ? 'Unlike post' : 'Like post'} disabled={busy} onClick={() => void like()} className={`${btn} ${post.likedByMe ? 'text-brand' : 'text-slate-600'}`}>
          <ThumbIcon filled={post.likedByMe} className="h-5 w-5" /> Like
        </button>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(true);
            setFocus((n) => n + 1);
          }}
          className={action}
        >
          <CommentIcon className="h-5 w-5" /> Comment
        </button>
        {shareId ? (
          <Link href={`/${area}/community?sharePost=${shareId}`} scroll={false} className={action}>
            <ShareIcon className="h-5 w-5" /> Share
          </Link>
        ) : (
          <span className={`${action} cursor-not-allowed opacity-50`} aria-disabled="true">
            <ShareIcon className="h-5 w-5" /> Share
          </span>
        )}
      </footer>

      {open ? <Comments post={post} focus={focus} onCount={(comments) => patch({ comments })} /> : null}
    </article>
  );
}

function Comments({ post, focus, onCount }: { post: CommunityPostItem; focus: number; onCount: (n: number) => void }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const key = [...COMMUNITY_KEY, 'comments', post.id];
  const load = () => authed<Paginated<CommunityCommentItem>>(`/community/posts/${post.id}/comments?limit=50`);
  const list = useQuery({ queryKey: key, queryFn: load });
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const phone = containsPhoneNumber(body);

  useEffect(() => {
    if (focus) input.current?.focus();
  }, [focus]);

  // Someone else commented while this thread is open: show it.
  useSocketEvent<{ postId: string; authorId: string }>(COMMUNITY_WS_EVENTS.newComment, (e) => {
    if (e.postId === post.id) void qc.invalidateQueries({ queryKey: key });
  });

  // Always ask the server (the default 30 s cache would hand back the list from before).
  const reload = async () => onCount((await qc.fetchQuery({ queryKey: key, queryFn: load, staleTime: 0 })).meta.total);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || phone) return;
    setBusy(true);
    setError(null);
    try {
      await authed(`/community/posts/${post.id}/comments`, { method: 'POST', body: { body } });
      setBody('');
      await reload();
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
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div className="space-y-2 border-t border-slate-200 px-4 pb-3 pt-2">
      {list.isPending ? (
        <p className="text-sm text-slate-500">Loading comments…</p>
      ) : list.isError ? (
        <Alert>{list.error.message}</Alert>
      ) : (
        <ul className="space-y-2">
          {list.data.data.map((c) => (
            <li key={c.id} className="flex gap-2">
              <Avatar a={c.author} size="h-8 w-8" />
              <div className="min-w-0">
                <div className="inline-block max-w-full rounded-2xl bg-slate-100 px-3 py-2">
                  <div className="text-[13px]">
                    <AuthorName a={c.author} />
                  </div>
                  <p className="whitespace-pre-line break-words text-[15px] text-slate-900">{c.body}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 px-3 pt-0.5 text-xs font-semibold text-slate-500">
                  <span className="font-normal">{ago(c.createdAt)}</span>
                  <button
                    type="button"
                    aria-pressed={c.likedByMe}
                    onClick={() => void act(() => authed(`/community/comments/${c.id}/like`, { method: c.likedByMe ? 'DELETE' : 'POST' }))}
                    className={c.likedByMe ? 'text-brand' : 'hover:underline'}
                  >
                    Like{c.likes > 0 ? ` · ${c.likes}` : ''}
                  </button>
                  {c.mine ? (
                    <button type="button" onClick={() => window.confirm('Delete this comment?') && void act(() => authed(`/community/comments/${c.id}`, { method: 'DELETE' }))} className="hover:underline">
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
        <div className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 items-end rounded-2xl bg-slate-100 pr-1">
            <textarea
              ref={input}
              id={`comment-${post.id}`}
              rows={1}
              maxLength={COMMUNITY_COMMENT_MAX_CHARS}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a comment…"
              className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 text-[15px] outline-none"
            />
            <button type="submit" disabled={busy || !body.trim() || phone} className="mb-1 rounded-full px-3 py-1.5 text-sm font-semibold text-brand disabled:text-slate-400">
              Send
            </button>
          </div>
        </div>
        {phone ? <p className="text-sm text-red-600">Please do not share phone numbers in the community. Use chat instead.</p> : null}
        {error ? <Alert>{error}</Alert> : null}
      </form>
    </div>
  );
}

/** Applies `changes` to the post wherever it is cached (feed pages or the single post). */
export function patchPost(data: unknown, id: string, changes: Partial<CommunityPostItem>): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = data as { pages?: { data: CommunityPostItem[] }[]; id?: string };
  if (Array.isArray(d.pages)) {
    return { ...d, pages: d.pages.map((p) => ({ ...p, data: p.data.map((x) => (x.id === id ? { ...x, ...changes } : x)) })) };
  }
  if (d.id === id) return { ...d, ...changes };
  return data;
}
