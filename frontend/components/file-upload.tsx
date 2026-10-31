'use client';

import { useRef, useState } from 'react';
import { UPLOAD_RULES, type SignablePurpose } from '@edu-forum/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { uploadFile, UploadError } from '@/lib/upload';

/**
 * Picks a file, uploads it to storage with a signed URL, then hands the upload id to
 * `onUploaded` (which calls the feature endpoint). Shows progress and any error.
 */
export function FileUpload({
  purpose,
  label,
  onUploaded,
  hint,
}: {
  purpose: SignablePurpose;
  label: string;
  onUploaded: (uploadId: string, file: File) => Promise<void>;
  hint?: string;
}) {
  const { authed } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rule = UPLOAD_RULES[purpose];
  const accept = [...Object.keys(rule.mimeTypes), ...Object.values(rule.mimeTypes).map((e) => `.${e}`)].join(',');

  async function onFile(file: File) {
    setError(null);
    setProgress(0);
    try {
      const uploadId = await uploadFile(authed, purpose, file, setProgress);
      await onUploaded(uploadId, file);
    } catch (err) {
      setError(err instanceof UploadError || err instanceof ApiError ? err.message : 'Upload failed. Please try again.');
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }

  const inputId = `upload-${purpose}`;
  return (
    <div className="space-y-1">
      <label
        htmlFor={inputId}
        className={`inline-flex cursor-pointer items-center justify-center rounded-lg border border-emerald-700 px-4 py-2.5 text-base font-semibold text-emerald-800 hover:bg-emerald-50 ${progress !== null ? 'pointer-events-none opacity-60' : ''}`}
      >
        {progress !== null ? `Uploading… ${progress}%` : label}
      </label>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
      />
      <p className="text-sm text-slate-500">{hint ?? `${rule.label}, up to 5 MB.`}</p>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
