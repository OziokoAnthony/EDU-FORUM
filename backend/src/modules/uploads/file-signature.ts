/**
 * Checks a file's first bytes against its declared type, so a renamed .exe cannot pass as
 * a PDF. The extension and MIME type were already checked when the upload was signed.
 */
const SIGNATURES: Record<string, (head: Buffer) => boolean> = {
  // Some PDF writers put a few bytes before the header; the spec allows it within 1 KB.
  'application/pdf': (h) => h.subarray(0, 1024).includes('%PDF-'),
  // DOC is an OLE2 compound file.
  'application/msword': (h) => h.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  // DOCX is a ZIP archive.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (h) =>
    h.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  // PPT is OLE2 like DOC; PPTX is a ZIP like DOCX.
  'application/vnd.ms-powerpoint': (h) => h.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': (h) => h.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  'image/jpeg': (h) => h.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  'image/png': (h) => h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (h) => h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP',
};

/** Bytes to fetch for the check. */
export const SIGNATURE_BYTES = 1024;

export function matchesSignature(mimeType: string, head: Buffer): boolean {
  return SIGNATURES[mimeType]?.(head) ?? false;
}
