import { describe, expect, it } from 'vitest';
import { paginationQuerySchema } from './api';

describe('paginationQuerySchema', () => {
  it('defaults to page 1, limit 20', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('rejects limit above 50', () => {
    expect(paginationQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });
});
