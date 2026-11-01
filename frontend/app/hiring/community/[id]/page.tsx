'use client';

import { use } from 'react';
import { SinglePost } from '@/components/community/single-post';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SinglePost id={id} area="hiring" />;
}
