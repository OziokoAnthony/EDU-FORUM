import { ADSENSE_CLIENT } from '@/lib/ads';

// Read at request time so setting the publisher ID needs no rebuild of this file.
export const dynamic = 'force-dynamic';

/** /ads.txt at the root (CLAUDE.md): authorises Google to sell our ad space. */
export function GET() {
  const pub = ADSENSE_CLIENT.replace(/^ca-/, '');
  const body = pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : '# AdSense is not set up yet.\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
