'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  BLOG_BODY_MIN_CHARS,
  BLOG_EXCERPT_MAX,
  BLOG_META_DESCRIPTION_MAX,
  BLOG_META_TITLE_MAX,
  BLOG_STATUS_LABELS,
  BLOG_TITLE_MAX,
  htmlToText,
  type BlogCategoryItem,
  type BlogStatus,
  type MyBlogPost,
} from '@edu-forum/shared';
import { PhotoIcon } from '@/components/icons';
import { Alert, Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { uploadFile, UploadError } from '@/lib/upload';

const RichTextEditor = dynamic(() => import('@/components/rich-text-editor'), {
  ssr: false,
  loading: () => <p className="px-3 py-2.5 text-sm text-slate-500">Loading editor…</p>,
});

export type WriterArea = 'teacher' | 'hiring' | 'admin';
const KEY = ['my-blog-posts'] as const;

const STATUS_STYLE: Record<BlogStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending: 'bg-amber-100 text-amber-800',
  published: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
};

export function StatusPill({ status, removed }: { status: BlogStatus; removed?: boolean }) {
  if (removed) return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Removed</span>;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{BLOG_STATUS_LABELS[status]}</span>;
}

/** /{area}/blog: the writer's posts with their status. */
export function MyBlogPosts({ area }: { area: WriterArea }) {
  const { authed } = useAuth();
  const posts = useQuery({ queryKey: KEY, queryFn: () => authed<MyBlogPost[]>('/posts/mine') });
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl text-slate-900">My blog posts</h1>
        <Link href={`/${area}/blog/new`} className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-600">
          Write a post
        </Link>
      </div>
      <p className="text-sm text-slate-600">
        {area === 'admin'
          ? 'Your posts go live as soon as you publish them.'
          : 'Write about teaching, exams or your school. When you send a post, our team checks it before it appears on the public blog.'}{' '}
        <Link href="/blog" className="text-brand hover:underline">
          Read the blog
        </Link>
      </p>
      {posts.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : posts.isError ? (
        <Alert>{posts.error.message}</Alert>
      ) : posts.data.length === 0 ? (
        <p className="rounded-lg bg-panel p-6 text-center text-slate-600 shadow-sm">You have not written any posts yet.</p>
      ) : (
        <ul className="space-y-3">
          {posts.data.map((p) => (
            <li key={p.id} className="rounded-lg bg-panel p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={p.status} removed={!!p.removedReason} />
                <span className="text-xs text-slate-500">Updated {new Date(p.updatedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })}</span>
              </div>
              <Link href={`/${area}/blog/${p.id}`} className="mt-1 block text-lg font-semibold text-slate-900 hover:underline">
                {p.title}
              </Link>
              {p.status === 'rejected' && p.reviewNote ? <p className="text-sm text-red-700">Not approved: {p.reviewNote}</p> : null}
              {p.removedReason ? <p className="text-sm text-red-700">Removed by a moderator: {p.removedReason}</p> : null}
              <p className="mt-1 flex flex-wrap gap-3 text-sm text-slate-500">
                {p.path ? (
                  <Link href={p.path} className="font-semibold text-brand hover:underline">
                    View on the blog
                  </Link>
                ) : null}
                {p.status === 'published' ? (
                  <span>
                    {p.likes} likes · {p.comments} comments
                  </span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** Write or edit a post: title, category, summary, cover photo, body, search texts. */
export function BlogEditor({ area, id }: { area: WriterArea; id?: string }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const existing = useQuery({ queryKey: [...KEY, id], queryFn: () => authed<MyBlogPost>(`/posts/mine/${id}`), enabled: !!id });
  const categories = useQuery({ queryKey: ['blog-categories'], queryFn: () => authed<BlogCategoryItem[]>('/blog/categories'), staleTime: 10 * 60_000 });

  if (id && existing.isPending) return <p className="px-4 py-10 text-center text-slate-500">Loading…</p>;
  if (id && existing.isError) return <p className="px-4 py-10 text-center text-red-700">{existing.error.message}</p>;
  return (
    <EditorForm
      key={existing.data?.id ?? 'new'}
      area={area}
      post={existing.data}
      categories={categories.data ?? []}
      onSaved={(p, created) => {
        qc.setQueryData([...KEY, p.id], p);
        void qc.invalidateQueries({ queryKey: KEY, exact: true });
        if (created) router.replace(`/${area}/blog/${p.id}`);
      }}
      onDeleted={() => {
        void qc.invalidateQueries({ queryKey: KEY });
        router.replace(`/${area}/blog`);
      }}
    />
  );
}

function EditorForm({
  area,
  post,
  categories,
  onSaved,
  onDeleted,
}: {
  area: WriterArea;
  post?: MyBlogPost;
  categories: BlogCategoryItem[];
  onSaved: (p: MyBlogPost, created: boolean) => void;
  onDeleted: () => void;
}) {
  const { authed } = useAuth();
  const [title, setTitle] = useState(post?.title ?? '');
  const [category, setCategory] = useState(post?.category ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [metaTitle, setMetaTitle] = useState(post?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(post?.metaDescription ?? '');
  const [cover, setCover] = useState<{ uploadId: string | null; preview: string | null }>({ uploadId: post?.coverUploadId ?? null, preview: post?.coverUrl ?? null });
  const [busy, setBusy] = useState<null | 'save' | 'send' | 'cover' | 'delete'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const chars = htmlToText(body).length;
  const live = post?.status === 'published' && !post.removedReason;
  const removed = !!post?.removedReason;

  const payload = () => ({
    title,
    body,
    category: category || null,
    excerpt: excerpt || null,
    coverUploadId: cover.uploadId,
    metaTitle: metaTitle || null,
    metaDescription: metaDescription || null,
  });

  async function save(): Promise<MyBlogPost | null> {
    setError(null);
    setFieldErrors({});
    try {
      const saved = post
        ? await authed<MyBlogPost>(`/posts/${post.id}`, { method: 'PATCH', body: payload() })
        : await authed<MyBlogPost>('/posts', { method: 'POST', body: payload() });
      return saved;
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors());
        setError(err.message === 'Validation failed' ? 'Please fix the highlighted fields.' : err.message);
      } else setError('Could not save. Try again.');
      return null;
    }
  }

  async function saveDraft() {
    setBusy('save');
    const saved = await save();
    setBusy(null);
    if (saved) {
      setNotice(live && area !== 'admin' ? 'Saved. Your changes were sent for approval; the post is offline until an admin approves it.' : 'Draft saved.');
      onSaved(saved, !post);
    }
  }

  async function send() {
    setBusy('send');
    const saved = await save();
    if (!saved) return setBusy(null);
    try {
      const sent = await authed<MyBlogPost>(`/posts/${saved.id}/submit`, { method: 'POST' });
      setNotice(sent.status === 'published' ? 'Published.' : 'Sent for approval. We will let you know when an admin has checked it.');
      onSaved(sent, !post);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send. Try again.');
      onSaved(saved, !post);
    } finally {
      setBusy(null);
    }
  }

  async function pickCover(file: File | undefined) {
    if (!file) return;
    setBusy('cover');
    setError(null);
    try {
      const uploadId = await uploadFile(authed, 'post_cover', file);
      setCover({ uploadId, preview: URL.createObjectURL(file) });
    } catch (err) {
      setError(err instanceof UploadError ? err.message : err instanceof ApiError ? err.message : 'Could not upload the photo.');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!post || !window.confirm('Delete this post? This cannot be undone.')) return;
    setBusy('delete');
    try {
      await authed(`/posts/${post.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete.');
      setBusy(null);
    }
  }

  const input = 'block w-full rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';
  const err = (k: string) => (fieldErrors[k] ? <p className="text-sm text-red-600">{fieldErrors[k]}</p> : null);

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Link href={`/${area}/blog`} className="text-sm font-semibold text-brand hover:underline">
        ← My blog posts
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl text-slate-900">{post ? 'Edit post' : 'Write a post'}</h1>
        {post ? <StatusPill status={post.status} removed={removed} /> : null}
      </div>

      {post?.status === 'rejected' && post.reviewNote ? <Alert>Not approved: {post.reviewNote}. Edit the post and send it again.</Alert> : null}
      {removed ? <Alert>Removed by a moderator: {post?.removedReason}. It can no longer be edited.</Alert> : null}
      {post?.status === 'pending' ? <Alert kind="info">Waiting for an admin to approve it. You can still make changes.</Alert> : null}
      {live && post?.path ? (
        <Alert kind="success">
          Published:{' '}
          <Link href={post.path} className="font-semibold underline">
            view it on the blog
          </Link>
          .{area !== 'admin' ? ' Saving changes sends it back for approval and takes it offline until then.' : ''}
        </Alert>
      ) : null}
      {notice ? <Alert kind="success">{notice}</Alert> : null}

      <form onSubmit={(e) => (e.preventDefault(), void send())} noValidate className="space-y-4 rounded-lg bg-panel p-4 shadow-sm sm:p-6">
        <fieldset disabled={removed || !!busy} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="blog-title" className="block text-sm font-medium text-slate-800">
              Title
            </label>
            <input id="blog-title" value={title} maxLength={BLOG_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} className={input} placeholder="e.g. How I prepare SS3 students for WAEC physics" />
            {err('title')}
          </div>

          <div className="space-y-1">
            <label htmlFor="blog-category" className="block text-sm font-medium text-slate-800">
              Category
            </label>
            <select id="blog-category" value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            {err('category')}
          </div>

          <div className="space-y-1">
            <span className="block text-sm font-medium text-slate-800">Cover photo (optional)</span>
            <div className="overflow-hidden rounded-lg border border-dashed border-slate-300">
              {cover.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover.preview} alt="Cover preview" className="aspect-[16/9] w-full object-cover" />
              ) : post?.coverStatus === 'scanning' ? (
                <p className="p-6 text-center text-sm text-slate-500">Checking the photo…</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 p-3">
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Cover photo" onChange={(e) => (void pickCover(e.target.files?.[0]), (e.target.value = ''))} />
                <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">
                  <PhotoIcon className="h-5 w-5 text-green-600" /> {busy === 'cover' ? 'Uploading…' : cover.uploadId ? 'Change photo' : 'Add a photo'}
                </button>
                {cover.uploadId ? (
                  <button type="button" onClick={() => setCover({ uploadId: null, preview: null })} className="text-sm font-semibold text-slate-600 hover:underline">
                    Remove
                  </button>
                ) : null}
                <span className="text-xs text-slate-500">JPG, PNG or WebP, up to 5 MB. Checked for viruses before it shows.</span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="blog-body" className="block text-sm font-medium text-slate-800">
              Your post
            </label>
            <div className="rounded-md border border-slate-300">
              <RichTextEditor id="blog-body" value={body} onChange={setBody} invalid={!!fieldErrors.body} />
            </div>
            <p className={`text-xs ${chars < BLOG_BODY_MIN_CHARS ? 'text-slate-500' : 'text-green-700'}`}>
              {chars.toLocaleString('en-NG')} characters (at least {BLOG_BODY_MIN_CHARS} to send). Do not share phone numbers: readers can reach you through chat.
            </p>
            {err('body')}
          </div>

          <div className="space-y-1">
            <label htmlFor="blog-excerpt" className="block text-sm font-medium text-slate-800">
              Short summary (optional)
            </label>
            <textarea id="blog-excerpt" rows={2} value={excerpt} maxLength={BLOG_EXCERPT_MAX} onChange={(e) => setExcerpt(e.target.value)} className={input} placeholder="Shown on the blog list. We use the first lines of your post if you leave it empty." />
            {err('excerpt')}
          </div>

          <details className="rounded-md border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Search engine text (optional)</summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-1">
                <label htmlFor="blog-meta-title" className="block text-sm font-medium text-slate-800">
                  Search title ({metaTitle.length}/{BLOG_META_TITLE_MAX})
                </label>
                <input id="blog-meta-title" value={metaTitle} maxLength={BLOG_META_TITLE_MAX} onChange={(e) => setMetaTitle(e.target.value)} className={input} />
                {err('metaTitle')}
              </div>
              <div className="space-y-1">
                <label htmlFor="blog-meta-description" className="block text-sm font-medium text-slate-800">
                  Search description ({metaDescription.length}/{BLOG_META_DESCRIPTION_MAX})
                </label>
                <textarea id="blog-meta-description" rows={2} value={metaDescription} maxLength={BLOG_META_DESCRIPTION_MAX} onChange={(e) => setMetaDescription(e.target.value)} className={input} />
                {err('metaDescription')}
              </div>
            </div>
          </details>
        </fieldset>

        {error ? <Alert>{error}</Alert> : null}

        {!removed ? (
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="submit" loading={busy === 'send'} disabled={!!busy || post?.status === 'published'} className="sm:w-auto">
              {area === 'admin' ? 'Publish' : 'Send for approval'}
            </Button>
            <button type="button" disabled={!!busy || title.trim().length === 0} onClick={() => void saveDraft()} className="rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {busy === 'save' ? 'Saving…' : live ? 'Save changes' : 'Save draft'}
            </button>
            {post ? (
              <button type="button" disabled={!!busy} onClick={() => void remove()} className="rounded-lg px-4 py-3 font-semibold text-red-700 hover:bg-red-50 sm:mr-auto">
                Delete
              </button>
            ) : null}
          </div>
        ) : null}
      </form>
    </main>
  );
}
