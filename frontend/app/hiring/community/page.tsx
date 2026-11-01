'use client';

import { Suspense } from 'react';
import { CommunityFeed } from '@/components/community/feed';

export default function Page() {
  return (
    <Suspense fallback={<p className="px-4 py-10 text-center text-slate-500">Loading…</p>}>
      <CommunityFeed area="hiring" />
    </Suspense>
  );
}
