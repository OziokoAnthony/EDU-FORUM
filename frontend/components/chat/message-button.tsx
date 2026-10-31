'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ConversationItem } from '@edu-forum/shared';
import { Alert, Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Principals/directors: open (or reopen) the chat with a teacher. */
export function MessageButton({ teacherId, applicationId, label = 'Message' }: { teacherId: string; applicationId?: string; label?: string }) {
  const { authed } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const c = await authed<ConversationItem>('/conversations', { method: 'POST', body: { teacherId, applicationId } });
      router.push(`/hiring/messages/${c.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open the chat. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" loading={busy} onClick={() => void open()} className="sm:w-auto">
        {label}
      </Button>
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}
