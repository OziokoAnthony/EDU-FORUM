import type { ApiErrorBody } from '@edu-forum/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody['error'],
  ) {
    super(body.message);
  }

  /** Field errors from a 400 VALIDATION_ERROR, keyed by field path. */
  fieldErrors(): Record<string, string> {
    const issues = (this.body.details as { issues?: { path: string; message: string }[] } | undefined)?.issues;
    return Object.fromEntries((issues ?? []).map((i) => [i.path, i.message]));
  }
}

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  accessToken?: string | null;
}

/** Fetch wrapper for the EDU-FORUM API; throws ApiError with the standard error body. */
export async function api<T>(path: string, { body, accessToken, headers, ...init }: ApiOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, err?.error ?? { code: 'INTERNAL_ERROR', message: res.statusText });
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
