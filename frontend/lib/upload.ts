import { signUploadSchema, type SignablePurpose, type SignUploadResponse } from '@edu-forum/shared';
import type { useAuth } from './auth';

type Authed = ReturnType<typeof useAuth>['authed'];

export class UploadError extends Error {}

/**
 * Signed-URL upload: checks the file with the shared schema, asks the API for a 10-minute
 * PUT URL, then sends the file straight to storage. Returns the upload id the feature
 * endpoint (CV, photo, certificate) needs.
 */
export async function uploadFile(
  authed: Authed,
  purpose: SignablePurpose,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const request = { purpose, fileName: file.name, mimeType: file.type, sizeBytes: file.size };
  const checked = signUploadSchema.safeParse(request);
  if (!checked.success) throw new UploadError(checked.error.issues[0].message);

  const signed = await authed<SignUploadResponse>('/uploads/sign', { method: 'POST', body: checked.data });
  await new Promise<void>((resolve, reject) => {
    // XHR rather than fetch: it reports upload progress, which matters on slow 3G.
    const xhr = new XMLHttpRequest();
    xhr.open(signed.method, signed.url);
    for (const [name, value] of Object.entries(signed.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new UploadError('Upload failed. Please try again.')));
    xhr.onerror = () => reject(new UploadError('Upload failed. Check your connection and try again.'));
    xhr.send(file);
  });
  return signed.uploadId;
}
