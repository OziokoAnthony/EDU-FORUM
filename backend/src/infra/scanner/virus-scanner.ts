import { connect } from 'node:net';

export type ScanVerdict = { clean: true } | { clean: false; signature: string };

export interface VirusScanner {
  /** Throws when the scanner is unreachable, so the job is retried rather than passed. */
  scan(file: Buffer): Promise<ScanVerdict>;
}

export const VIRUS_SCANNER = Symbol('VIRUS_SCANNER');

/** The standard antivirus test string; every scanner reports it as infected. */
export const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/** ClamAV daemon over TCP using the INSTREAM command (length-prefixed chunks). */
export class ClamavScanner implements VirusScanner {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 60_000,
  ) {}

  scan(file: Buffer): Promise<ScanVerdict> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.port, this.host);
      const chunks: Buffer[] = [];
      socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error('ClamAV timed out')));
      socket.on('error', reject);
      socket.on('data', (d: Buffer) => chunks.push(d));
      socket.on('end', () => {
        // Replies look like "stream: OK" or "stream: Eicar-Signature FOUND".
        const reply = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
        const found = /^stream: (.+) FOUND$/.exec(reply);
        if (reply === 'stream: OK') resolve({ clean: true });
        else if (found) resolve({ clean: false, signature: found[1] });
        else reject(new Error(`Unexpected ClamAV reply: ${reply}`));
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        const chunkSize = 64 * 1024;
        for (let i = 0; i < file.length; i += chunkSize) {
          const chunk = file.subarray(i, i + chunkSize);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4)); // zero-length chunk ends the stream
      });
    });
  }
}

/** Tests: anything containing the EICAR string is infected. */
export class MemoryScanner implements VirusScanner {
  async scan(file: Buffer): Promise<ScanVerdict> {
    return file.includes(EICAR) ? { clean: false, signature: 'Eicar-Test-Signature' } : { clean: true };
  }
}
