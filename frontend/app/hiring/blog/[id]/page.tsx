'use client';

import { use } from 'react';
import { BlogEditor } from '@/components/blog/writer';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BlogEditor area="hiring" id={id} />;
}
