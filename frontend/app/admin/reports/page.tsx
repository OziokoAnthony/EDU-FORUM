'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { REPORT_REASON_LABELS, type AdminReportItem, type Paginated } from '@edu-forum/shared';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { shortDate } from '@/lib/format';
import { AdminNav, askReason } from '../admin-nav';

const TARGET_LABEL = { teacher_profile: 'Teacher profile', vacancy: 'Vacancy', message: 'Message', community_post: 'Community post', community_comment: 'Community comment', blog_post: 'Blog post', blog_comment: 'Blog comment' } as const;

/** Removal endpoints for community and blog items (each emails the author the reason). */
const REMOVE_PATH = {
  community_post: (id: string) => `/admin/community/posts/${id}/remove`,
  community_comment: (id: string) => `/admin/community/comments/${id}/remove`,
  blog_post: (id: string) => `/admin/posts/${id}/remove`,
  blog_comment: (id: string) => `/admin/blog-comments/${id}/remove`,
} as const;

/** FR-11 reports queue: act on the target (take down / hide), then resolve or dismiss. */
export default function Page() {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const reports = useQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: () => authed<Paginated<AdminReportItem>>(`/admin/reports?status=${status}&limit=50`),
    staleTime: 0,
  });

  async function run(fn: () => Promise<unknown>, ok: string) {
    setNotice(null);
    try {
      await fn();
      setNotice({ kind: 'success', text: ok });
      await qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }

  function close(r: AdminReportItem, to: 'resolved' | 'dismissed') {
    const resolution = window.prompt(to === 'resolved' ? 'What did you do about it?' : 'Why are you dismissing it?');
    if (!resolution || resolution.trim().length < 3) return;
    void run(() => authed(`/admin/reports/${r.id}`, { method: 'PATCH', body: { status: to, resolution } }), `Report ${to}.`);
  }

  function actOnTarget(r: AdminReportItem) {
    if (r.targetType === 'vacancy') {
      const reason = askReason('take down this vacancy');
      if (reason) void run(() => authed(`/admin/vacancies/${r.targetId}/takedown`, { method: 'POST', body: { reason } }), 'Vacancy taken down.');
    } else if (r.targetType === 'teacher_profile') {
      const reason = askReason('hide this profile');
      if (reason) void run(() => authed(`/admin/teachers/${r.targetId}/unpublish`, { method: 'POST', body: { reason } }), 'Profile hidden.');
    } else if (r.targetType in REMOVE_PATH) {
      const what = TARGET_LABEL[r.targetType].toLowerCase();
      const reason = askReason(`remove this ${what}`);
      const path = REMOVE_PATH[r.targetType as keyof typeof REMOVE_PATH](r.targetId);
      if (reason) void run(() => authed(path, { method: 'POST', body: { reason } }), `The ${what} was removed and its author told why.`);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <AdminNav current="reports" />
      <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
      <div className="flex gap-2" role="tablist">
        {(['open', 'resolved', 'dismissed'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1.5 text-sm capitalize ${status === s ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {s}
          </button>
        ))}
      </div>
      {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}
      {reports.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : reports.isError ? (
        <Alert>{reports.error.message}</Alert>
      ) : reports.data.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">No {status} reports.</p>
      ) : (
        <ul className="space-y-3">
          {reports.data.data.map((r) => (
            <li key={r.id} className="space-y-2 rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-slate-900">
                  {TARGET_LABEL[r.targetType]}: {r.targetLabel}
                </p>
                {r.openOnTarget > 1 ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">{r.openOnTarget} open reports</span> : null}
              </div>
              <p className="text-sm text-slate-700">
                {REPORT_REASON_LABELS[r.reason]} · by {r.reporter.email ?? r.reporter.role} ({r.reporter.role}) · {shortDate(r.createdAt)}
              </p>
              {r.details ? <p className="rounded bg-slate-50 p-2 text-sm text-slate-800">{r.details}</p> : null}
              {r.resolution ? <p className="text-sm text-slate-600">Outcome: {r.resolution}</p> : null}
              {r.status === 'open' ? (
                <div className="flex flex-wrap gap-4 text-sm font-semibold">
                  {r.targetType !== 'message' ? (
                    <button type="button" className="text-red-700 underline" onClick={() => actOnTarget(r)}>
                      {r.targetType === 'vacancy' ? 'Take down vacancy' : r.targetType === 'teacher_profile' ? 'Hide profile' : `Remove ${TARGET_LABEL[r.targetType].toLowerCase()}`}
                    </button>
                  ) : null}
                  <button type="button" className="text-emerald-800 underline" onClick={() => close(r, 'resolved')}>
                    Mark resolved
                  </button>
                  <button type="button" className="text-slate-600 underline" onClick={() => close(r, 'dismissed')}>
                    Dismiss
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
