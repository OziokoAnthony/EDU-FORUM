import { z } from 'zod';

/** CLAUDE.md: CVs (and every other upload) are at most 5 MB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const CV_MIME_TYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
} as const;

const IMAGE_MIME_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
const DOCUMENT_MIME_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' } as const;

/** Upload purposes the API signs. */
export const SIGNABLE_PURPOSES = ['cv', 'profile_photo', 'qualification_file', 'certification_file', 'message_attachment', 'community_photo', 'post_cover'] as const;
export type SignablePurpose = (typeof SIGNABLE_PURPOSES)[number];

/** Allowed MIME types per purpose, each with the extensions the file name may use. */
export const UPLOAD_RULES: Record<SignablePurpose, { mimeTypes: Record<string, string>; label: string }> = {
  cv: { mimeTypes: CV_MIME_TYPES, label: 'PDF, DOC or DOCX' },
  profile_photo: { mimeTypes: IMAGE_MIME_TYPES, label: 'JPG, PNG or WebP' },
  qualification_file: { mimeTypes: DOCUMENT_MIME_TYPES, label: 'PDF, JPG or PNG' },
  certification_file: { mimeTypes: DOCUMENT_MIME_TYPES, label: 'PDF, JPG or PNG' },
  // PRD FR-8: chat attachments are PDFs or images, 5 MB.
  message_attachment: { mimeTypes: { 'application/pdf': 'pdf', ...IMAGE_MIME_TYPES }, label: 'PDF, JPG, PNG or WebP' },
  // Community posts: up to 4 photos (confirmed 2026-11-01).
  community_photo: { mimeTypes: IMAGE_MIME_TYPES, label: 'JPG, PNG or WebP' },
  // Blog cover photo (user, 2026-11-01).
  post_cover: { mimeTypes: IMAGE_MIME_TYPES, label: 'JPG, PNG or WebP' },
};

/** Extensions accepted for a canonical extension (".jpeg" is a ".jpg"). */
const EXTENSION_ALIASES: Record<string, string> = { jpeg: 'jpg' };

export function fileExtension(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return EXTENSION_ALIASES[ext] ?? ext;
}

/** POST /uploads/sign. The MIME type and extension must agree and match the purpose. */
export const signUploadSchema = z
  .object({
    purpose: z.enum(SIGNABLE_PURPOSES),
    fileName: z.string().trim().min(1, 'File name is required').max(200, 'File name is too long'),
    mimeType: z.string().trim().toLowerCase(),
    sizeBytes: z
      .number()
      .int()
      .positive('The file is empty')
      .max(MAX_UPLOAD_BYTES, 'File must be 5 MB or smaller'),
  })
  .superRefine((v, ctx) => {
    const rule = UPLOAD_RULES[v.purpose];
    const ext = rule.mimeTypes[v.mimeType];
    if (!ext) {
      ctx.addIssue({ code: 'custom', path: ['mimeType'], message: `File must be ${rule.label}` });
    } else if (fileExtension(v.fileName) !== ext) {
      ctx.addIssue({ code: 'custom', path: ['fileName'], message: `File must be ${rule.label}` });
    }
  });
export type SignUploadInput = z.input<typeof signUploadSchema>;

export interface SignUploadResponse {
  uploadId: string;
  /** PUT the file here with exactly these headers; the URL expires in 10 minutes. */
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

/** Body for endpoints that take a finished upload (CV, photo). */
export const uploadRefSchema = z.object({ uploadId: z.uuid('Upload the file first') });

export type ScanStatus = 'pending' | 'clean' | 'infected' | 'failed';

/** POST /webhooks/storage/scan-result (storage provider's scanner, if used instead of ClamAV). */
export const scanResultSchema = z.object({
  uploadId: z.uuid(),
  status: z.enum(['clean', 'infected']),
  signature: z.string().max(200).optional(),
});
