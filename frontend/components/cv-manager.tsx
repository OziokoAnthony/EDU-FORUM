'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { CvResponse } from '@edu-forum/shared';
import { FileUpload } from '@/components/file-upload';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CV_KEY, useMyCv, useRefreshTeacher } from '@/lib/teacher';

const sizeLabel = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

/** Upload / replace the CV, see its scan status, and (optionally) manage previous versions. */
export function CvManager({ showHistory = false }: { showHistory?: boolean }) {
  const { authed } = useAuth();
  const refresh = useRefreshTeacher();
  const cv = useMyCv();
  const active = cv.data?.active ?? null;
  const pending = cv.data?.pending ?? [];

  return (
    <div className="space-y-6">
      {active ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Active CV</p>
          <p className="mt-1 break-all text-slate-900">{active.fileName}</p>
          <p className="text-sm text-slate-600">
            {active.mimeType.toUpperCase()} · {sizeLabel(active.sizeBytes)} · uploaded {dateLabel(active.uploadedAt)}
          </p>
          <div className="mt-3 flex gap-4 text-sm font-semibold">
            {active.viewUrl ? (
              <a href={active.viewUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-800 underline">
                View
              </a>
            ) : null}
            {active.downloadUrl ? (
              <a href={active.downloadUrl} className="text-emerald-800 underline">
                Download
              </a>
            ) : null}
          </div>
        </section>
      ) : cv.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <p className="text-slate-600">You have not uploaded a CV yet. A CV is required to publish your profile.</p>
      )}

      {pending.map((p) => (
        <Alert key={p.id} kind={p.scanStatus === 'pending' ? 'info' : 'error'}>
          {p.scanStatus === 'pending'
            ? `Checking ${p.fileName} for viruses… It becomes your active CV in a moment.`
            : p.scanStatus === 'infected'
              ? `${p.fileName} was rejected by our virus scan. Please upload a different file.`
              : `We could not process ${p.fileName}. Please upload it again.`}
        </Alert>
      ))}

      <FileUpload
        purpose="cv"
        label={active ? 'Replace CV' : 'Upload CV'}
        hint="PDF, DOC or DOCX, up to 5 MB. Replacing keeps your previous CV for 90 days."
        onUploaded={async (uploadId) => {
          await authed('/teachers/me/cv', { method: 'POST', body: { uploadId } });
          refresh();
        }}
      />

      {showHistory ? <CvHistory /> : null}
    </div>
  );
}

function CvHistory() {
  const { authed } = useAuth();
  const refresh = useRefreshTeacher();
  const [error, setError] = useState<string | null>(null);
  const history = useQuery({
    queryKey: [...CV_KEY, 'history'],
    queryFn: async () => (await authed<{ data: CvResponse[] }>('/teachers/me/cv/history')).data,
  });

  if (!history.data?.length) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">Previous versions</h2>
      <p className="text-sm text-slate-600">Kept for 90 days after you replace them.</p>
      {error ? <Alert>{error}</Alert> : null}
      <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
        {history.data.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate text-slate-900">{h.fileName}</p>
              <p className="text-sm text-slate-600">Replaced {h.replacedAt ? dateLabel(h.replacedAt) : ''}</p>
            </div>
            <div className="flex shrink-0 gap-3 text-sm font-semibold">
              {h.downloadUrl ? (
                <a href={h.downloadUrl} className="text-emerald-800 underline">
                  Download
                </a>
              ) : null}
              <button
                type="button"
                className="text-red-700 underline"
                onClick={async () => {
                  setError(null);
                  try {
                    await authed(`/teachers/me/cv/${h.id}`, { method: 'DELETE' });
                    await history.refetch();
                    refresh();
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'Could not delete. Try again.');
                  }
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
