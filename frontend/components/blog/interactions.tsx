'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  BLOG_COMMENT_MAX_CHARS,
  containsPhoneNumber,
  type BlogCommentItem,
  type BlogPostDetail,
  type LikeResponse,
  type Paginated,
} from '@edu-forum/shared';
import { CommentIcon, PeopleIcon, ShareIcon, ThumbIcon } from '@/components/icons';
import { ReportButton } from '@/components/report-button';
import { Alert } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';

const ago = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });

/**
 * Likes, share buttons and comments under a public blog post. The page is server-rendered with
 * the counts and comments (visible to everyone and to Google); this island restores the session
 * so registered users can like, comment, report and share into the community.
 */
export function BlogInteractions(props: { post: BlogPostDetail; initialComments: Paginated<BlogCommentItem> | null }) {
  return (
    <AuthProvider>
      <Inner {...props} />
    </AuthProvider>
  );
}

function Inner({ post, initialComments }: { post: BlogPostDetail; initialComments: Paginated<BlogCommentItem> | null }) {
  const { status, user, authed } = useAuth();
  const qc = useQueryClient();
  const signedIn = status === 'signed-in' && !!user?.verified;
  const loginHref = `/login?next=${encodeURIComponent(post.path)}`;

  // Signed in: re-read with the token for "liked by me", "mine" and blocks.
  const detail = useQuery({
    queryKey: ['blog-post', post.slug, signedIn],
    queryFn: () => (signedIn ? authed<BlogPostDetail>(`/posts/by-slug/${post.slug}`) : api<BlogPostDetail>(`/posts/by-slug/${post.slug}`)),
    initialData: signedIn ? undefined : post,
    enabled: status !== 'loading',
  });
  const commentsKey = ['blog-comments', post.id, signedIn];
  const loadComments = () =>
    signedIn ? authed<Paginated<BlogCommentItem>>(`/posts/${post.id}/comments?limit=50`) : api<Paginated<BlogCommentItem>>(`/posts/${post.id}/comments?limit=50`);
  const comments = useQuery({ queryKey: commentsKey, queryFn: loadComments, initialData: signedIn ? undefined : (initialComments ?? undefined), enabled: status !== 'loading' });

  const p = detail.data ?? post;
  const list = comments.data ?? initialComments;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);
  const phone = containsPhoneNumber(body);
  const url = typeof window === 'undefined' ? post.path : `${window.location.origin}${post.path}`;
  const shareText = encodeURIComponent(`${post.title} ${url}`);

  async function like() {
    setBusy(true);
    setError(null);
    try {
      const res = await authed<LikeResponse>(`/posts/${post.id}/like`, { method: p.likedByMe ? 'DELETE' : 'POST' });
      qc.setQueryData(['blog-post', post.slug, signedIn], { ...p, likes: res.likes, likedByMe: res.likedByMe });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const fresh = await qc.fetchQuery({ queryKey: commentsKey, queryFn: loadComments, staleTime: 0 });
    qc.setQueryData(['blog-post', post.slug, signedIn], { ...p, comments: fresh.meta.total });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || phone) return;
    setBusy(true);
    setError(null);
    try {
      await authed(`/posts/${post.id}/comments`, { method: 'POST', body: { body } });
      setBody('');
      await refresh();
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
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  const btn = 'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-[15px] font-semibold hover:bg-slate-100 disabled:opacity-60';
  const communityHref = user?.role === 'teacher' ? '/teacher/community' : user?.role === 'principal' || user?.role === 'director' ? '/hiring/community' : null;

  return (
    <section aria-label="Likes, sharing and comments" className="border-t border-slate-200">
      <div className="flex items-center justify-between px-5 pt-3 text-[15px] text-slate-500 sm:px-8">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-brand text-white">
            <ThumbIcon filled className="h-2.5 w-2.5" />
          </span>
          <span aria-label={`${p.likes} ${p.likes === 1 ? 'like' : 'likes'}`}>{p.likes}</span>
        </span>
        <span>
          {p.comments} {p.comments === 1 ? 'comment' : 'comments'}
        </span>
      </div>

      <div className="mx-5 mt-2 flex gap-1 border-y border-slate-200 py-1 sm:mx-8">
        {signedIn ? (
          <button type="button" aria-pressed={p.likedByMe} aria-label={p.likedByMe ? 'Unlike post' : 'Like post'} disabled={busy} onClick={() => void like()} className={`${btn} ${p.likedByMe ? 'text-brand' : 'text-slate-600'}`}>
            <ThumbIcon filled={p.likedByMe} className="h-5 w-5" /> Like
          </button>
        ) : (
          <Link href={loginHref} className={`${btn} text-slate-600`}>
            <ThumbIcon className="h-5 w-5" /> Like
          </Link>
        )}
        <a href="#comment-box" className={`${btn} text-slate-600`}>
          <CommentIcon className="h-5 w-5" /> Comment
        </a>
        {communityHref ? (
          <Link href={`${communityHref}?shareBlog=${post.id}&title=${encodeURIComponent(post.title.slice(0, 120))}`} className={`${btn} text-slate-600`}>
            <PeopleIcon className="h-5 w-5" /> <span className="hidden sm:inline">Share in</span> community
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm sm:px-8">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
          <ShareIcon className="h-4 w-4" /> Share:
        </span>
        <a href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#25d366] px-3 py-1.5 font-semibold text-white">
          WhatsApp
        </a>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#1877f2] px-3 py-1.5 font-semibold text-white">
          Facebook
        </a>
        <a href={`https://twitter.com/intent/tweet?text=${shareText}`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-slate-900 px-3 py-1.5 font-semibold text-white">
          X
        </a>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(url).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-200"
        >
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        {signedIn ? (
          <span className="ml-auto">
            <ReportButton targetType="blog_post" targetId={post.id} label="Report post" />
          </span>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-slate-200 px-5 py-4 sm:px-8">
        <h2 className="text-lg text-slate-900">Comments</h2>
        {error ? <Alert>{error}</Alert> : null}
        {list && list.data.length ? (
          <ul className="space-y-3">
            {list.data.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600">
                  {c.author.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <div className="inline-block max-w-full rounded-2xl bg-slate-100 px-3 py-2">
                    <p className="text-[13px] font-semibold text-slate-900">{c.author.name}</p>
                    <p className="whitespace-pre-line break-words text-[15px] text-slate-900">{c.body}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 px-3 pt-0.5 text-xs font-semibold text-slate-500">
                    <span className="font-normal">{ago(c.createdAt)}</span>
                    {signedIn ? (
                      <button
                        type="button"
                        aria-pressed={c.likedByMe}
                        onClick={() => void act(() => authed(`/blog-comments/${c.id}/like`, { method: c.likedByMe ? 'DELETE' : 'POST' }))}
                        className={c.likedByMe ? 'text-brand' : 'hover:underline'}
                      >
                        Like{c.likes > 0 ? ` · ${c.likes}` : ''}
                      </button>
                    ) : c.likes > 0 ? (
                      <span>
                        {c.likes} {c.likes === 1 ? 'like' : 'likes'}
                      </span>
                    ) : null}
                    {signedIn && c.mine ? (
                      <button type="button" onClick={() => window.confirm('Delete this comment?') && void act(() => authed(`/blog-comments/${c.id}`, { method: 'DELETE' }))} className="hover:underline">
                        Delete
                      </button>
                    ) : signedIn ? (
                      <ReportButton targetType="blog_comment" targetId={c.id} />
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No comments yet.</p>
        )}

        {signedIn ? (
          <form onSubmit={send} id="comment-box" className="space-y-1">
            <label htmlFor={`blog-comment-${post.id}`} className="sr-only">
              Write a comment
            </label>
            <div className="flex items-end rounded-2xl bg-slate-100 pr-1">
              <textarea
                id={`blog-comment-${post.id}`}
                rows={1}
                maxLength={BLOG_COMMENT_MAX_CHARS}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write a comment…"
                className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 text-[15px] outline-none"
              />
              <button type="submit" disabled={busy || !body.trim() || phone} className="mb-1 rounded-full px-3 py-1.5 text-sm font-semibold text-brand disabled:text-slate-400">
                Send
              </button>
            </div>
            {phone ? <p className="text-sm text-red-600">Please do not share phone numbers on the blog. Use chat instead.</p> : null}
          </form>
        ) : (
          <p id="comment-box" className="text-sm text-slate-600">
            <Link href={loginHref} className="font-semibold text-brand hover:underline">
              Sign in
            </Link>{' '}
            or{' '}
            <Link href="/register" className="font-semibold text-brand hover:underline">
              join free
            </Link>{' '}
            to like and comment.
          </p>
        )}
      </div>
    </section>
  );
}
