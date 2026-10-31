import { describe, expect, it } from 'vitest';
import { applySchema, canMove, moveStatusSchema } from './applications';

describe('application pipeline', () => {
  it('moves forward only, and may skip steps', () => {
    expect(canMove('applied', 'viewed')).toBe(true);
    expect(canMove('viewed', 'offered')).toBe(true);
    expect(canMove('shortlisted', 'viewed')).toBe(false);
    expect(canMove('applied', 'applied')).toBe(false);
  });

  it('rejected or withdrawn from any non-final step; finals never move', () => {
    expect(canMove('interview', 'rejected')).toBe(true);
    expect(canMove('offered', 'withdrawn')).toBe(true);
    for (const final of ['hired', 'rejected', 'withdrawn'] as const) {
      expect(canMove(final, 'shortlisted')).toBe(false);
      expect(canMove(final, 'rejected')).toBe(false);
    }
  });

  it('posters cannot set "applied" or "withdrawn"', () => {
    expect(moveStatusSchema.safeParse({ status: 'withdrawn' }).success).toBe(false);
    expect(moveStatusSchema.safeParse({ status: 'applied' }).success).toBe(false);
    expect(moveStatusSchema.parse({ status: 'hired' })).toEqual({ status: 'hired', closeVacancy: false });
  });

  it('apply: optional cover note, answers need text', () => {
    expect(applySchema.parse({})).toEqual({ screeningAnswers: [] });
    expect(applySchema.safeParse({ screeningAnswers: [{ questionId: '00000000-0000-4000-8000-000000000000', answer: ' ' }] }).success).toBe(false);
  });
});
