/** Server-side API base (can be an internal address in production). Used only by server components. */
const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export const SITE_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** How long public pages may be served from cache before refreshing (seconds). */
export const PUBLIC_REVALIDATE = 300;

/**
 * Fetch for server-rendered public pages. Responses are cached for 5 minutes and tagged, so
 * the API can refresh them the moment a job changes (POST /api/revalidate). Returns the
 * status too, because 404 and 410 drive the page.
 */
export async function serverGet<T>(path: string, tags: string[] = []): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${API}${path}`, { next: { revalidate: PUBLIC_REVALIDATE, tags } }).catch(() => null);
  // API unreachable: render without data rather than failing the whole page.
  if (!res) return { status: 503, data: null };
  if (!res.ok) return { status: res.status, data: null };
  return { status: res.status, data: (await res.json()) as T };
}
