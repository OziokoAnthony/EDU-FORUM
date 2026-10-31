import { NextResponse, type NextRequest } from 'next/server';

const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
/** A job URL ends in the 8-character short id: /jobs/{slug}-{shortId}. */
const JOB_PATH = /^\/jobs\/([a-z0-9-]+-[a-z2-9]{8})$/;

/**
 * CLAUDE.md: a job closed more than 30 days ago answers 410 Gone, so search engines drop it.
 * Only job URLs are checked; every other request passes straight through.
 */
export async function proxy(request: NextRequest) {
  const match = JOB_PATH.exec(request.nextUrl.pathname);
  if (!match) return NextResponse.next();
  const res = await fetch(`${API}/vacancies/by-slug/${match[1]}`, { method: 'GET' }).catch(() => null);
  if (res?.status !== 410) return NextResponse.next();
  return new NextResponse(
    '<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Position closed</title></head><body style="font-family:system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem"><h1>This position has closed</h1><p><a href="/jobs">See current teaching jobs</a></p></body></html>',
    { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } },
  );
}

export const config = { matcher: '/jobs/:slug' };
