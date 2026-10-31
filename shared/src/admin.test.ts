import { describe, expect, it } from 'vitest';
import { adminTeachersQuerySchema, metaItemUpdateSchema, reasonSchema, reportSchema } from './admin';

describe('admin and reports', () => {
  it('reports need a known target type and reason', () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect(reportSchema.safeParse({ targetType: 'vacancy', targetId: id, reason: 'spam' }).success).toBe(true);
    expect(reportSchema.safeParse({ targetType: 'school', targetId: id, reason: 'spam' }).success).toBe(false);
    expect(reportSchema.safeParse({ targetType: 'vacancy', targetId: id, reason: 'boring' }).success).toBe(false);
  });

  it('moderation actions need a real reason', () => {
    expect(reasonSchema.safeParse({ reason: 'no' }).success).toBe(false);
    expect(reasonSchema.safeParse({ reason: 'Fake job advert' }).success).toBe(true);
  });

  it('query flags parse from strings; edits need at least one field', () => {
    expect(adminTeachersQuerySchema.parse({ hidden: 'true', published: 'false' })).toMatchObject({ hidden: true, published: false, page: 1 });
    expect(metaItemUpdateSchema.safeParse({}).success).toBe(false);
  });
});
