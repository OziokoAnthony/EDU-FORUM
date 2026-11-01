'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  COMMUNITY_MAX_PHOTOS,
  COMMUNITY_POST_MAX_CHARS,
  COMMUNITY_WS_EVENTS,
  containsPhoneNumber,
  type CommunityFeedPage,
  type CommunityPostItem,
  type CommunityPostUpdate,
  type CommunityTagItem,
  type VacancyResponse,
} from '@edu-forum/shared';
import { Alert, Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSocketEvent } from '@/lib/realtime';
import { uploadFile, UploadError } from '@/lib/upload';
import { COMMUNITY_KEY } from './keys';
import { patchPost, PostCard } from './post-card';

function useTags() {
  const { authed } = useAuth();
  return useQuery({ queryKey: [...COMMUNITY_KEY, 'tags'], queryFn: () => authed<CommunityTagItem[]>('/community/tags'), staleTime: 10 * 60_000 });
}

/** Shared by the teacher and hiring areas: one feed for every signed-in teacher, principal and director. */
export function CommunityFeed({ area }: { area: 'teacher' | 'hiring' }) {
  const { authed, user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const tag = params.get('tag') ?? undefined;
  const share = params.get('share');
  const tags = useTags();
  const [fresh, setFresh] = useState(0);

  const key = [...COMMUNITY_KEY, 'feed', tag ?? 'all'];
  const feed = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams();
      if (tag) q.set('tag', tag);
      if (pageParam) q.set('before', pageParam);
      return authed<CommunityFeedPage>(`/community/posts?${q}`);
    },
    getNextPageParam: (last) => last.nextBefore,
  });

  // Live: someone else posted → "N new posts" (no jumping feed); counts update in place.
  useSocketEvent<{ postId: string; authorId: string }>(COMMUNITY_WS_EVENTS.newPost, (e) => {
    if (e.authorId !== user?.id) setFresh((n) => n + 1);
  });
  useSocketEvent<CommunityPostUpdate>(COMMUNITY_WS_EVENTS.postUpdated, (e) => {
    qc.setQueriesData({ queryKey: COMMUNITY_KEY }, (data: unknown) => patchPost(data, e.postId, { likes: e.likes, comments: e.comments }));
    // Photos finishing their scan arrive this way too: refresh that post's photos.
    const posts = feed.data?.pages.flatMap((p) => p.data) ?? [];
    if (posts.some((p) => p.id === e.postId && p.photos.some((ph) => ph.status === 'scanning'))) void feed.refetch();
  });
  useSocketEvent<{ postId: string }>(COMMUNITY_WS_EVENTS.postRemoved, (e) => {
    qc.setQueriesData({ queryKey: key }, (data: unknown) => {
      const d = data as { pages: CommunityFeedPage[] } | undefined;
      return d ? { ...d, pages: d.pages.map((p) => ({ ...p, data: p.data.filter((x) => x.id !== e.postId) })) } : data;
    });
  });

  const showFresh = () => {
    setFresh(0);
    void qc.resetQueries({ queryKey: key });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setTag = (slug?: string) => router.replace(`/${area}/community${slug ? `?tag=${slug}` : ''}`);

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl text-slate-900">Community</h1>
        <Link href={`/${area}`} className="text-sm text-emerald-800 underline">
          ← Back to dashboard
        </Link>
      </div>
      <p className="text-slate-600">Share ideas and news with teachers, principals and directors across Nigeria. Only signed-in members can see this.</p>

      <Composer tags={tags.data ?? []} shareVacancyId={share} onPosted={() => {
        if (share) router.replace(`/${area}/community`);
        void qc.resetQueries({ queryKey: key });
      }} />

      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Filter by topic">
        {[{ slug: undefined, name: 'All' } as { slug?: string; name: string }, ...(tags.data ?? [])].map((t) => (
          <button
            key={t.slug ?? 'all'}
            type="button"
            role="tab"
            aria-selected={tag === t.slug}
            onClick={() => setTag(t.slug)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${tag === t.slug ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {fresh > 0 ? (
        <button type="button" onClick={showFresh} className="sticky top-2 z-10 mx-auto block rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          ↑ {fresh} new {fresh === 1 ? 'post' : 'posts'}
        </button>
      ) : null}

      {feed.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : feed.isError ? (
        <Alert>{feed.error.message}</Alert>
      ) : feed.data.pages[0].data.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-600">No posts here yet. Be the first to share something.</p>
      ) : (
        <div className="space-y-4">
          {feed.data.pages.flatMap((p) => p.data).map((post: CommunityPostItem) => (
            <PostCard key={post.id} post={post} area={area} />
          ))}
          {feed.hasNextPage ? (
            <button type="button" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()} className="mx-auto block font-semibold text-emerald-800 underline disabled:opacity-50">
              {feed.isFetchingNextPage ? 'Loading…' : 'Show older posts'}
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
}

function Composer({ tags, shareVacancyId, onPosted }: { tags: CommunityTagItem[]; shareVacancyId: string | null; onPosted: () => void }) {
  const { authed } = useAuth();
  const [body, setBody] = useState('');
  const [tag, setTag] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropJob, setDropJob] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const vacancyId = shareVacancyId && !dropJob ? shareVacancyId : null;
  const job = useQuery({
    queryKey: ['vacancy', vacancyId],
    queryFn: () => authed<VacancyResponse>(`/vacancies/${vacancyId}`),
    enabled: !!vacancyId,
  });
  const phone = containsPhoneNumber(body);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, COMMUNITY_MAX_PHOTOS);
    if (files.length + list.length > COMMUNITY_MAX_PHOTOS) setError(`You can add up to ${COMMUNITY_MAX_PHOTOS} photos.`);
    setFiles(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phone) return;
    setBusy(true);
    setError(null);
    try {
      const uploadIds: string[] = [];
      for (const [i, f] of files.entries()) {
        setProgress(`Uploading photo ${i + 1} of ${files.length}…`);
        uploadIds.push(await uploadFile(authed, 'community_photo', f));
      }
      setProgress(null);
      await authed('/community/posts', { method: 'POST', body: { body, tag: tag || undefined, uploadIds, vacancyId: vacancyId ?? undefined } });
      setBody('');
      setTag('');
      setFiles([]);
      onPosted();
    } catch (err) {
      setError(err instanceof UploadError ? err.message : err instanceof ApiError ? (Object.values(err.fieldErrors())[0] ?? err.message) : 'Could not post. Try again.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-md border border-slate-200 bg-panel p-4">
      <label htmlFor="post-body" className="sr-only">
        What would you like to share?
      </label>
      <textarea
        id="post-body"
        rows={3}
        maxLength={COMMUNITY_POST_MAX_CHARS}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What would you like to share?"
        className="w-full rounded-md border border-slate-300 px-3 py-2"
      />
      <div className="flex justify-between text-xs text-slate-500">
        <span>Do not share phone numbers here: use chat.</span>
        <span>
          {body.length.toLocaleString('en-NG')}/{COMMUNITY_POST_MAX_CHARS.toLocaleString('en-NG')}
        </span>
      </div>
      {phone ? <Alert>Please do not share phone numbers in the community. Use chat instead.</Alert> : null}

      {vacancyId ? (
        <div className="flex items-start justify-between gap-2 rounded-md border border-gold/50 bg-gold/10 p-3 text-sm">
          <span>
            Sharing job: <span className="font-semibold">{job.data ? `${job.data.title} · ${job.data.schoolLabel}` : 'loading…'}</span>
          </span>
          <button type="button" onClick={() => setDropJob(true)} className="text-slate-600 underline">
            Remove
          </button>
        </div>
      ) : null}

      {files.length ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm">
              📷 {f.name}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-slate-500">
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="post-tag" className="sr-only">
          Topic
        </label>
        <select id="post-tag" value={tag} onChange={(e) => setTag(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Topic (optional)</option>
          {tags.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} aria-label="Add photos" />
        <button
          type="button"
          disabled={files.length >= COMMUNITY_MAX_PHOTOS}
          onClick={() => fileInput.current?.click()}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          📷 Add photos ({files.length}/{COMMUNITY_MAX_PHOTOS})
        </button>
        <Button type="submit" loading={busy} disabled={phone || (!body.trim() && !files.length && !vacancyId)} className="ml-auto sm:w-auto">
          Post
        </Button>
      </div>
      {progress ? <p className="text-sm text-slate-600">{progress}</p> : null}
      {error ? <Alert>{error}</Alert> : null}
    </form>
  );
}
