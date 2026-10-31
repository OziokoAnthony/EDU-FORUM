'use client';

import { ConversationList } from '@/components/chat/conversations';
import { HiringNav } from '../hiring-nav';

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <HiringNav current="messages" />
      <h1 className="text-3xl text-slate-900">Messages</h1>
      <ConversationList base="/hiring/messages" empty="No chats yet. Open a teacher's profile and tap Message." />
    </main>
  );
}
