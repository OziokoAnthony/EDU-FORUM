import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

describe('api()', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws ApiError carrying the standard error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Missing' } }), {
          status: 404,
        }),
      ),
    );
    await expect(api('/x')).rejects.toMatchObject({
      status: 404,
      body: { code: 'NOT_FOUND', message: 'Missing' },
    });
    await expect(api('/x')).rejects.toBeInstanceOf(ApiError);
  });
});
