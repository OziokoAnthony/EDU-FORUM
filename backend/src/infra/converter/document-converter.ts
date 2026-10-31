/** DOC/DOCX → PDF so the CV viewer can show every CV in the browser. */
export interface DocumentConverter {
  toPdf(file: Buffer, fileName: string): Promise<Buffer>;
}

export const DOCUMENT_CONVERTER = Symbol('DOCUMENT_CONVERTER');

/** Gotenberg's LibreOffice route (docker compose service `gotenberg`). */
export class GotenbergConverter implements DocumentConverter {
  constructor(private readonly baseUrl: string) {}

  async toPdf(file: Buffer, fileName: string): Promise<Buffer> {
    const form = new FormData();
    form.append('files', new Blob([new Uint8Array(file)]), fileName);
    const res = await fetch(`${this.baseUrl}/forms/libreoffice/convert`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Gotenberg ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Tests: returns a tiny placeholder PDF. */
export class MemoryConverter implements DocumentConverter {
  readonly converted: string[] = [];

  async toPdf(_file: Buffer, fileName: string): Promise<Buffer> {
    this.converted.push(fileName);
    return Buffer.from('%PDF-1.4\n% converted in tests\n');
  }
}
