'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  COMMUNITY_MAX_PHOTOS,
  COMMUNITY_POST_MAX_CHARS,
  COMMUNITY_WS_EVENTS,
  containsPhoneNumber,
  type CommunityFeedPage,
  type CommunityPostItem,
  type CommunityPostUpdate,
  type CommunityTagItem,
  type HiringDashboard,
  type TeacherDashboard,
  type VacancyResponse,
} from '@edu-forum/shared';
import {
  BookmarkIcon,
  ChatIcon,
  CloseIcon,
  HomeIcon,
  JobsIcon,
  PeopleIcon,
  PhotoIcon,
  TeachersIcon,
} from '@/components/icons';
import { Alert, Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { useSocketEvent } from '@/lib/realtime';
import { uploadFile, UploadError } from '@/lib/upload';
import { Portal } from '@/components/portal';
import { COMMUNITY_KEY } from './keys';
import { Avatar, ago, patchPost, PostCard } from './post-card';

type Area = 'teacher' | 'hiring';

function useTags() {
  const { authed } = useAuth();
  return useQuery({
    queryKey: [...COMMUNITY_KEY, 'tags'],
    queryFn: () => authed<CommunityTagItem[]>('/community/tags'),
    staleTime: 10 * 60_000,
  });
}

/**
 * The community feed (Facebook-like layout, user 2026-11-01): shortcuts and topics on the left,
 * the feed in the middle, suggested jobs (teachers) or teachers (principals/directors) on the
 * right. Phones get one column with topic chips. `?share=<vacancyId>` and `?sharePost=<postId>`
 * open the composer with the job or post attached.
 */
export function CommunityFeed({ area }: { area: Area }) {
  const { authed, user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const tag = params.get('tag') ?? undefined;
  const shareJob = params.get('share');
  const sharePost = params.get('sharePost');
  const shareBlog = params.get('shareBlog');
  const shareBlogTitle = params.get('title');
  const tags = useTags();
  const [fresh, setFresh] = useState(0);
  const [composing, setComposing] = useState(false);
  const open = composing || !!shareJob || !!sharePost || !!shareBlog;

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
    qc.setQueriesData({ queryKey: COMMUNITY_KEY }, (data: unknown) =>
      patchPost(data, e.postId, { likes: e.likes, comments: e.comments, shares: e.shares }),
    );
    // Photos finishing their scan arrive this way too: refresh that post's photos.
    const posts = feed.data?.pages.flatMap((p) => p.data) ?? [];
    if (posts.some((p) => p.id === e.postId && p.photos.some((ph) => ph.status === 'scanning')))
      void feed.refetch();
  });
  useSocketEvent<{ postId: string }>(COMMUNITY_WS_EVENTS.postRemoved, (e) => {
    qc.setQueriesData({ queryKey: key }, (data: unknown) => {
      const d = data as { pages: CommunityFeedPage[] } | undefined;
      return d
        ? {
            ...d,
            pages: d.pages.map((p) => ({ ...p, data: p.data.filter((x) => x.id !== e.postId) })),
          }
        : data;
    });
  });

  const showFresh = () => {
    setFresh(0);
    void qc.resetQueries({ queryKey: key });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const base = `/${area}/community`;
  const tagHref = (slug?: string) => (slug ? `${base}?tag=${slug}` : base);
  const closeComposer = () => {
    setComposing(false);
    if (shareJob || sharePost || shareBlog) router.replace(tagHref(tag), { scroll: false });
  };
  const allTags = [
    { slug: undefined, name: 'All posts' } as { slug?: string; name: string },
    ...(tags.data ?? []),
  ];
  const me = { name: (user?.email ?? user?.phone ?? 'Y').charAt(0).toUpperCase(), photoUrl: null };

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-0 py-4 sm:px-4 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_19rem]">
      <aside
        className="sticky top-[4.5rem] hidden h-fit space-y-4 lg:block"
        aria-label="Shortcuts and topics"
      >
        <Shortcuts area={area} />
        <nav aria-label="Topics" className="border-t border-slate-300 pt-3">
          <h2 className="px-2 pb-1 text-[17px] text-slate-500">Topics</h2>
          {allTags.map((t) => (
            <Link
              key={t.slug ?? 'all'}
              href={tagHref(t.slug)}
              aria-current={tag === t.slug ? 'page' : undefined}
              className={`block rounded-lg px-2 py-2 text-[15px] font-semibold ${tag === t.slug ? 'bg-brand/10 text-brand' : 'text-slate-800 hover:bg-slate-200/70'}`}
            >
              {t.slug ? '# ' : ''}
              {t.name}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="mx-auto w-full max-w-[42rem] space-y-4">
        <h1 className="sr-only">Community</h1>
        <div className="rounded-lg bg-panel px-4 pb-2 pt-3 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <Avatar a={me} />
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-left text-[17px] text-slate-500 hover:bg-slate-200"
            >
              What&apos;s on your mind?
            </button>
          </div>
          <div className="flex pt-1">
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[15px] font-semibold text-slate-600 hover:bg-slate-100"
            >
              <PhotoIcon className="h-6 w-6 text-green-600" /> Photo
            </button>
            <Link
              href={area === 'teacher' ? '/teacher/jobs' : '/hiring'}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[15px] font-semibold text-slate-600 hover:bg-slate-100"
            >
              <JobsIcon className="h-6 w-6 text-amber-500" /> Share a job
            </Link>
          </div>
        </div>
        <p className="px-4 text-xs text-slate-500 sm:px-0">
          Only signed-in teachers, principals and directors see the community. Do not share phone
          numbers here: use chat.
        </p>

        <div
          className="flex gap-2 overflow-x-auto px-4 pb-1 sm:px-0 lg:hidden"
          aria-label="Filter by topic"
        >
          {allTags.map((t) => (
            <Link
              key={t.slug ?? 'all'}
              href={tagHref(t.slug)}
              aria-current={tag === t.slug ? 'page' : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${tag === t.slug ? 'bg-brand text-white' : 'bg-panel text-slate-700 shadow-sm'}`}
            >
              {t.name}
            </Link>
          ))}
        </div>

        {fresh > 0 ? (
          <button
            type="button"
            onClick={showFresh}
            className="sticky top-[4.5rem] z-10 mx-auto block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-lg"
          >
            ↑ {fresh} new {fresh === 1 ? 'post' : 'posts'}
          </button>
        ) : null}

        {feed.isPending ? (
          <p className="text-center text-slate-500">Loading…</p>
        ) : feed.isError ? (
          <Alert>{feed.error.message}</Alert>
        ) : feed.data.pages[0].data.length === 0 ? (
          <p className="rounded-lg bg-panel p-6 text-center text-slate-600 shadow-sm">
            No posts here yet. Be the first to share something.
          </p>
        ) : (
          <div className="space-y-4">
            {feed.data.pages
              .flatMap((p) => p.data)
              .map((post: CommunityPostItem) => (
                <PostCard key={post.id} post={post} area={area} />
              ))}
            {feed.hasNextPage ? (
              <button
                type="button"
                disabled={feed.isFetchingNextPage}
                onClick={() => void feed.fetchNextPage()}
                className="mx-auto block rounded-md bg-panel px-4 py-2 font-semibold text-slate-700 shadow-sm disabled:opacity-50"
              >
                {feed.isFetchingNextPage ? 'Loading…' : 'Show older posts'}
              </button>
            ) : null}
          </div>
        )}
      </main>

      <aside className="sticky top-[4.5rem] hidden h-fit xl:block" aria-label="Suggestions">
        {area === 'teacher' ? <SuggestedJobs /> : <SuggestedTeachers />}
      </aside>

      {open ? (
        <Portal>
          <Composer
            me={me}
            tags={tags.data ?? []}
            defaultTag={tag}
            shareVacancyId={shareJob}
            sharePostId={sharePost}
            shareBlog={shareBlog ? { id: shareBlog, title: shareBlogTitle } : null}
            onClose={closeComposer}
            onPosted={() => {
              closeComposer();
              void qc.resetQueries({ queryKey: key });
            }}
          />
        </Portal>
      ) : null}
    </div>
  );
}

function Shortcuts({ area }: { area: Area }) {
  const items =
    area === 'teacher'
      ? [
          { href: '/teacher', label: 'Home', icon: <HomeIcon className="h-7 w-7 text-brand" /> },
          {
            href: '/teacher/jobs',
            label: 'Find jobs',
            icon: <JobsIcon className="h-7 w-7 text-amber-500" />,
          },
          {
            href: '/teacher/community',
            label: 'Community',
            icon: <PeopleIcon className="h-7 w-7 text-sky-500" />,
          },
          {
            href: '/teacher/messages',
            label: 'Messages',
            icon: <ChatIcon className="h-7 w-7 text-violet-500" />,
          },
          {
            href: '/teacher/saved',
            label: 'Saved',
            icon: <BookmarkIcon className="h-7 w-7 text-rose-500" />,
          },
        ]
      : [
          {
            href: '/hiring',
            label: 'My vacancies',
            icon: <HomeIcon className="h-7 w-7 text-brand" />,
          },
          {
            href: '/hiring/teachers',
            label: 'Find teachers',
            icon: <TeachersIcon className="h-7 w-7 text-amber-500" />,
          },
          {
            href: '/hiring/community',
            label: 'Community',
            icon: <PeopleIcon className="h-7 w-7 text-sky-500" />,
          },
          {
            href: '/hiring/messages',
            label: 'Messages',
            icon: <ChatIcon className="h-7 w-7 text-violet-500" />,
          },
          {
            href: '/hiring/saved',
            label: 'Saved',
            icon: <BookmarkIcon className="h-7 w-7 text-rose-500" />,
          },
        ];
  return (
    <nav aria-label="Shortcuts">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className="flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] font-semibold text-slate-800 hover:bg-slate-200/70"
        >
          {i.icon}
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

function SuggestedJobs() {
  const { authed } = useAuth();
  const d = useQuery({
    queryKey: ['teacher-dashboard'],
    queryFn: () => authed<TeacherDashboard>('/teachers/me/dashboard'),
    staleTime: 60_000,
  });
  const jobs = d.data?.recommended ?? [];
  return (
    <section className="space-y-1">
      <h2 className="px-2 text-[17px] text-slate-500">Suggested jobs</h2>
      {d.isPending ? (
        <p className="px-2 text-sm text-slate-500">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="px-2 text-sm text-slate-600">
          Complete your teaching preferences to see jobs picked for you.{' '}
          <Link href="/teacher/jobs" className="text-brand hover:underline">
            Browse jobs
          </Link>
        </p>
      ) : (
        jobs.map((v) => (
          <Link
            key={v.id}
            href={`/teacher/jobs/${v.id}`}
            className="block rounded-lg px-2 py-2 hover:bg-slate-200/70"
          >
            <p className="font-semibold text-slate-900">{v.title}</p>
            <p className="text-sm text-slate-600">
              {v.schoolLabel} · {v.lga.name}, {v.state.name}
            </p>
            <p className="text-sm text-slate-500">
              {money(v.salaryMin)} – {money(v.salaryMax)} · {ago(v.publishedAt)}
            </p>
          </Link>
        ))
      )}
    </section>
  );
}

function SuggestedTeachers() {
  const { authed } = useAuth();
  const d = useQuery({
    queryKey: ['hiring-dashboard'],
    queryFn: () => authed<HiringDashboard>('/hiring/dashboard'),
    staleTime: 60_000,
  });
  const rec = d.data?.recommended;
  return (
    <section className="space-y-1">
      <h2 className="px-2 text-[17px] text-slate-500">Suggested teachers</h2>
      {d.isPending ? (
        <p className="px-2 text-sm text-slate-500">Loading…</p>
      ) : !rec || rec.teachers.length === 0 ? (
        <p className="px-2 text-sm text-slate-600">
          Publish a vacancy to see teachers who match it.{' '}
          <Link href="/hiring/teachers" className="text-brand hover:underline">
            Find teachers
          </Link>
        </p>
      ) : (
        <>
          <p className="px-2 text-xs text-slate-500">For {rec.vacancyTitle}</p>
          {rec.teachers.map((t) => (
            <Link
              key={t.id}
              href={`/hiring/teachers/${t.id}`}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-200/70"
            >
              <Avatar a={{ name: t.fullName, photoUrl: t.photoUrl }} size="h-9 w-9" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-900">{t.fullName}</span>
                <span className="block truncate text-sm text-slate-500">
                  {t.lga?.name ? `${t.lga.name}, ` : ''}
                  {t.state?.name ?? ''} · {t.matchScore}% match
                </span>
              </span>
            </Link>
          ))}
        </>
      )}
    </section>
  );
}

// ───────────── composer pop-up ─────────────

function Composer({
  me,
  tags,
  defaultTag,
  shareVacancyId,
  sharePostId,
  shareBlog,
  onClose,
  onPosted,
}: {
  me: { name: string; photoUrl: null };
  tags: CommunityTagItem[];
  defaultTag?: string;
  shareVacancyId: string | null;
  sharePostId: string | null;
  shareBlog: { id: string; title: string | null } | null;
  onClose: () => void;
  onPosted: () => void;
}) {
  const { authed } = useAuth();
  const [body, setBody] = useState('');
  const [tag, setTag] = useState(defaultTag ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropJob, setDropJob] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const vacancyId = shareVacancyId && !dropJob ? shareVacancyId : null;
  const job = useQuery({
    queryKey: ['vacancy', vacancyId],
    queryFn: () => authed<VacancyResponse>(`/vacancies/${vacancyId}`),
    enabled: !!vacancyId,
  });
  const shared = useQuery({
    queryKey: [...COMMUNITY_KEY, 'post', sharePostId],
    queryFn: () => authed<CommunityPostItem>(`/community/posts/${sharePostId}`),
    enabled: !!sharePostId,
  });
  const previews = useObjectUrls(files);
  const phone = containsPhoneNumber(body);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    text.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !busyRef.current && closeRef.current();
    document.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
    };
  }, []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    if (files.length + list.length > COMMUNITY_MAX_PHOTOS)
      setError(`You can add up to ${COMMUNITY_MAX_PHOTOS} photos.`);
    setFiles([...files, ...Array.from(list)].slice(0, COMMUNITY_MAX_PHOTOS));
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
      await authed('/community/posts', {
        method: 'POST',
        body: {
          body,
          tag: tag || undefined,
          uploadIds,
          vacancyId: vacancyId ?? undefined,
          sharedPostId: sharePostId ?? undefined,
          blogPostId: shareBlog?.id,
        },
      });
      onPosted();
    } catch (err) {
      setError(
        err instanceof UploadError
          ? err.message
          : err instanceof ApiError
            ? (Object.values(err.fieldErrors())[0] ?? err.message)
            : 'Could not post. Try again.',
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const canPost = !phone && (!!body.trim() || files.length > 0 || !!vacancyId || !!sharePostId || !!shareBlog);
  const s = shared.data;
  const original = s?.shared?.available ? s.shared : s;

  return (
    <div
      className="fixed inset-0 z-40 flex animate-fade-in items-end justify-center bg-white/70 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <form
        onSubmit={submit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-title"
        className="flex max-h-[95vh] w-full animate-scale-in flex-col rounded-t-xl bg-panel shadow-[0_12px_28px_rgb(0_0_0/0.2),0_2px_4px_rgb(0_0_0/0.1)] sm:max-w-lg sm:rounded-xl"
      >
        <div className="relative border-b border-slate-200 px-4 py-4 text-center">
          <h2 id="composer-title" className="text-xl text-slate-900">
            {sharePostId ? 'Share post' : 'Create post'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3">
          <div className="flex items-center gap-2">
            <Avatar a={me} />
            <div>
              <p className="font-semibold text-slate-900">Post to Community</p>
              <label htmlFor="post-tag" className="sr-only">
                Topic
              </label>
              <select
                id="post-tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="mt-0.5 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
              >
                <option value="">No topic</option>
                {tags.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label htmlFor="post-body" className="sr-only">
            What&apos;s on your mind?
          </label>
          <textarea
            ref={text}
            id="post-body"
            rows={sharePostId || vacancyId || files.length ? 2 : 5}
            maxLength={COMMUNITY_POST_MAX_CHARS}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={sharePostId ? 'Say something about this…' : "What's on your mind?"}
            className="w-full resize-none border-0 bg-transparent text-xl text-slate-900 outline-none placeholder:text-slate-500"
          />
          <p className="text-right text-xs text-slate-500">
            {body.length.toLocaleString('en-NG')}/{COMMUNITY_POST_MAX_CHARS.toLocaleString('en-NG')}
          </p>
          {phone ? (
            <Alert>Please do not share phone numbers in the community. Use chat instead.</Alert>
          ) : null}

          {vacancyId ? (
            <div className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <span>
                Sharing job:{' '}
                <span className="font-semibold">
                  {job.data ? `${job.data.title} · ${job.data.schoolLabel}` : 'loading…'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setDropJob(true)}
                className="font-semibold text-slate-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ) : null}

          {shareBlog ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              Sharing blog post: <span className="font-semibold">{shareBlog.title ?? 'from the blog'}</span>
            </div>
          ) : null}

          {sharePostId ? (
            <div className="rounded-lg border border-slate-200 p-3 text-sm">
              {shared.isPending ? (
                <p className="text-slate-500">Loading the post…</p>
              ) : shared.isError || !original ? (
                <p className="text-red-700">This post is no longer available.</p>
              ) : (
                <>
                  <p className="font-semibold text-slate-900">
                    Sharing {original.author.name}&apos;s post
                  </p>
                  <p className="line-clamp-3 whitespace-pre-line text-slate-700">
                    {original.body ||
                      (original.photos.length
                        ? 'Photos'
                        : original.job
                          ? `Job: ${original.job.title}`
                          : '')}
                  </p>
                </>
              )}
            </div>
          ) : null}

          {files.length ? (
            <ul className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="relative aspect-square overflow-hidden rounded-md bg-slate-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {previews[i] ? (
                    <img src={previews[i]} alt={f.name} className="h-full w-full object-cover" />
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-slate-200 px-4 py-3">
          {!sharePostId ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-[15px] font-semibold text-slate-800">Add to your post</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))}
                aria-label="Add photos"
              />
              <button
                type="button"
                disabled={files.length >= COMMUNITY_MAX_PHOTOS}
                onClick={() => fileInput.current?.click()}
                aria-label={`Add photos (${files.length} of ${COMMUNITY_MAX_PHOTOS})`}
                className="flex h-10 items-center gap-1 rounded-full px-2 text-sm font-semibold text-green-600 hover:bg-slate-100 disabled:opacity-50"
              >
                <PhotoIcon className="h-6 w-6" /> {files.length}/{COMMUNITY_MAX_PHOTOS}
              </button>
            </div>
          ) : null}
          {progress ? <p className="text-sm text-slate-600">{progress}</p> : null}
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" loading={busy} disabled={!canPost}>
            {sharePostId ? 'Share now' : 'Post'}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Local previews of chosen photos, revoked when they change. */
function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return urls;
}
