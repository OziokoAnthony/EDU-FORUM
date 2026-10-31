import type { ApiErrorBody } from '@edu-forum/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody['error'],
  ) {
    super(body.message);
  }
}

/** Fetch wrapper for the EDU-FORUM API; throws ApiError with the standard error body. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body?.error ?? { code: 'INTERNAL_ERROR', message: res.statusText });
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
