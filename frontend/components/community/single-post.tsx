'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { CommunityPostItem } from '@edu-forum/shared';
import { Alert } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { COMMUNITY_KEY } from './keys';
import { PostCard } from './post-card';

/** One post with its comments open (links from "X commented on your post"). */
export function SinglePost({ id, area }: { id: string; area: 'teacher' | 'hiring' }) {
  const { authed } = useAuth();
  const post = useQuery({ queryKey: [...COMMUNITY_KEY, 'post', id], queryFn: () => authed<CommunityPostItem>(`/community/posts/${id}`) });
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href={`/${area}/community`} className="text-sm text-emerald-800 underline">
        ← Back to community
      </Link>
      {post.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : post.isError ? (
        <Alert>This post is no longer available.</Alert>
      ) : (
        <PostCard post={post.data} area={area} startOpen />
      )}
    </main>
  );
}
