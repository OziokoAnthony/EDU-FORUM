'use client';

import Link from 'next/link';
import { ConversationList } from '@/components/chat/conversations';

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link href="/teacher" className="text-sm text-emerald-800 underline">
        ← Back to dashboard
      </Link>
      <h1 className="text-3xl text-slate-900">Messages</h1>
      <p className="text-sm text-slate-600">Principals and directors can message you about jobs. Never pay anyone who asks for a fee.</p>
      <ConversationList base="/teacher/messages" empty="No messages yet. Principals and directors who like your profile can message you here." />
    </main>
  );
}
