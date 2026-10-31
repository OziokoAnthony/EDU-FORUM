'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  inviteMemberSchema,
  MEMBER_ROLE_LABELS,
  MEMBER_ROLES,
  SCHOOL_INVITE_TTL_DAYS,
  type MemberRole,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { Select } from '@/components/form';
import { Alert, Button, Field } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyApiError } from '@/lib/form-errors';
import { useMembers, useRefreshSchool } from '@/lib/school';

type Input = z.input<typeof inviteMemberSchema>;
type Output = z.output<typeof inviteMemberSchema>;

const roleOptions = MEMBER_ROLES.map((r) => ({ value: r, label: MEMBER_ROLE_LABELS[r] }));
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

/** Team members, pending invites and the invite form. Owners manage; recruiters only see the list. */
export function TeamManager({ isOwner }: { isOwner: boolean }) {
  const { authed } = useAuth();
  const refresh = useRefreshSchool();
  const members = useMembers();
  const [error, setError] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <div className="space-y-8">
      {isOwner ? <InviteForm onInvited={() => refresh()} /> : null}
      {error ? <Alert>{error}</Alert> : null}

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Team</h2>
        <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {(members.data?.data ?? []).map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="break-all text-slate-900">
                  {m.email ?? m.phone}
                  {m.isMe ? ' (you)' : ''}
                </p>
                <p className="text-sm text-slate-600">Joined {dateLabel(m.joinedAt)}</p>
              </div>
              {isOwner ? (
                <div className="flex items-center gap-3">
                  <label className="sr-only" htmlFor={`role-${m.userId}`}>
                    Role for {m.email ?? m.phone}
                  </label>
                  <select
                    id={`role-${m.userId}`}
                    value={m.role}
                    onChange={(e) =>
                      act(() => authed(`/schools/me/members/${m.userId}`, { method: 'PATCH', body: { role: e.target.value as MemberRole } }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  >
                    {roleOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="text-sm font-semibold text-red-700 underline"
                    onClick={() => act(() => authed(`/schools/me/members/${m.userId}`, { method: 'DELETE' }))}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <span className="text-sm text-slate-600">{MEMBER_ROLE_LABELS[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isOwner && members.data?.invites.length ? (
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Pending invites</h2>
          <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
            {members.data.invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="break-all text-slate-900">{i.email}</p>
                  <p className="text-sm text-slate-600">
                    {MEMBER_ROLE_LABELS[i.role]} · expires {dateLabel(i.expiresAt)}
                  </p>
                </div>
                <div className="flex gap-3 text-sm font-semibold">
                  <button
                    type="button"
                    className="text-emerald-800 underline"
                    onClick={() => act(() => authed('/schools/me/members/invite', { method: 'POST', body: { email: i.email, role: i.role } }))}
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    className="text-red-700 underline"
                    onClick={() => act(() => authed(`/schools/me/invites/${i.id}`, { method: 'DELETE' }))}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const { authed } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Output>({ resolver: zodResolver(inviteMemberSchema), defaultValues: { role: 'recruiter' } });

  async function onSubmit(values: Output) {
    setFormError(null);
    setSent(null);
    try {
      await authed('/schools/me/members/invite', { method: 'POST', body: values });
      setSent(values.email);
      reset({ email: '', role: 'recruiter' });
      onInvited();
    } catch (err) {
      setFormError(applyApiError(err, setError));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 rounded-lg border border-slate-200 p-4">
      <p className="text-slate-600">
        Invite colleagues who recruit for your school. They get an email link, valid for {SCHOOL_INVITE_TTL_DAYS} days.
      </p>
      <Field label="Email address" type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />
      <Select label="Role" options={roleOptions} hint="Owners can edit the school and manage the team." {...register('role')} />
      {sent ? <Alert kind="success">Invite sent to {sent}.</Alert> : null}
      {formError ? <Alert>{formError}</Alert> : null}
      <Button type="submit" loading={isSubmitting}>
        Send invite
      </Button>
    </form>
  );
}
