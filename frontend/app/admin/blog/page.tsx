'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { BLOG_STATUS_LABELS, type AdminBlogPostItem, type BlogStatus, type Paginated } from '@edu-forum/shared';
import { StatusPill } from '@/components/blog/writer';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AdminNav, askReason } from '../admin-nav';

const TABS: BlogStatus[] = ['pending', 'published', 'rejected'];

/** Blog review: approve or reject posts waiting for approval; take down published ones. */
export default function Page() {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<BlogStatus>('pending');
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['admin-blog', status], queryFn: () => authed<Paginated<AdminBlogPostItem>>(`/admin/posts?status=${status}&limit=50`) });

  async function act(path: string, body?: { reason: string }) {
    setError(null);
    try {
      await authed(path, { method: 'POST', body });
      await qc.invalidateQueries({ queryKey: ['admin-blog'] });
      setOpen(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <AdminNav current="blog" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl text-slate-900">Blog</h1>
        <Link href="/admin/blog/new" className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-600">
          Write a post
        </Link>
      </div>
      <div role="tablist" aria-label="Post status" className="flex gap-2">
        {TABS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${status === s ? 'bg-brand text-white' : 'bg-panel text-slate-700 shadow-sm'}`}
          >
            {BLOG_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {list.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : list.isError ? (
        <Alert>{list.error.message}</Alert>
      ) : list.data.data.length === 0 ? (
        <p className="rounded-lg bg-panel p-6 text-center text-slate-600 shadow-sm">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {list.data.data.map((p) => (
            <li key={p.id} className="rounded-lg bg-panel p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <StatusPill status={p.status} removed={!!p.removedReason} />
                <span>
                  {p.author.name}
                  {p.author.email ? ` (${p.author.email})` : ''}
                </span>
                {p.submittedAt ? <span>· sent {new Date(p.submittedAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}</span> : null}
              </div>
              <h2 className="mt-1 text-lg text-slate-900">{p.title}</h2>
              {p.reviewNote ? <p className="text-sm text-red-700">Rejected: {p.reviewNote}</p> : null}
              {p.removedReason ? <p className="text-sm text-red-700">Removed: {p.removedReason}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2 text-sm font-semibold">
                <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id} className="rounded-md bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-200">
                  {open === p.id ? 'Hide post' : 'Read post'}
                </button>
                {p.status === 'pending' ? (
                  <>
                    <button type="button" onClick={() => void act(`/admin/posts/${p.id}/approve`)} className="rounded-md bg-emerald-700 px-3 py-1.5 text-white hover:bg-emerald-600">
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const reason = askReason('reject this post');
                        if (reason) void act(`/admin/posts/${p.id}/reject`, { reason });
                      }}
                      className="rounded-md px-3 py-1.5 text-red-700 hover:bg-red-50"
                    >
                      Reject
                    </button>
                  </>
                ) : null}
                {p.status === 'published' && !p.removedReason ? (
                  <>
                    {p.path ? (
                      <Link href={p.path} className="rounded-md px-3 py-1.5 text-brand hover:bg-slate-100">
                        View
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        const reason = askReason('remove this post');
                        if (reason) void act(`/admin/posts/${p.id}/remove`, { reason });
                      }}
                      className="rounded-md px-3 py-1.5 text-red-700 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </>
                ) : null}
              </div>
              {open === p.id ? (
                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                  {p.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverUrl} alt="Cover" className="aspect-[16/9] w-full max-w-md rounded-md object-cover" />
                  ) : null}
                  <p className="text-sm text-slate-500">
                    Category: {p.category ?? 'none'}
                    {p.excerpt ? ` · Summary: ${p.excerpt}` : ''}
                  </p>
                  <div className="prose-blog" dangerouslySetInnerHTML={{ __html: p.body }} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
