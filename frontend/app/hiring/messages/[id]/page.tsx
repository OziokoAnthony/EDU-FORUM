'use client';

import { use } from 'react';
import { ChatThread } from '@/components/chat/thread';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ChatThread id={id} back="/hiring/messages" />;
}
