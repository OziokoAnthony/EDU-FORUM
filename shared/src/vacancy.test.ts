import { describe, expect, it } from 'vitest';
import { experienceUpdateSchema } from './teacher';
import { createVacancySchema, textLength, updateVacancySchema } from './vacancy';

const uuid = '00000000-0000-4000-8000-000000000000';
const base = {
  title: 'SS2 Physics Teacher',
  subjects: ['physics'],
  levels: ['sss'],
  jobType: 'full_time',
  salaryMin: 100_000,
  salaryMax: 200_000,
  description: `<p>${'a'.repeat(100)}</p>`,
  schoolName: 'Greenfield Academy',
  stateId: uuid,
  lgaId: uuid,
};

describe('vacancy schema', () => {
  it('counts visible characters only', () => {
    expect(textLength('<p><strong>Hi</strong>&nbsp;there</p>')).toBe(8);
  });

  it('defaults: NGN, monthly, listed, 1 opening, draft', () => {
    expect(createVacancySchema.parse(base)).toMatchObject({
      salaryCurrency: 'NGN',
      salaryPeriod: 'monthly',
      locationVisibility: 'listed',
      openings: 1,
      publish: false,
    });
  });

  it('salary min <= max and both > 0; school name required unless anonymous', () => {
    expect(createVacancySchema.safeParse({ ...base, salaryMin: 300_000 }).success).toBe(false);
    expect(createVacancySchema.safeParse({ ...base, salaryMin: 0 }).success).toBe(false);
    expect(createVacancySchema.safeParse({ ...base, schoolName: '' }).success).toBe(false);
    expect(createVacancySchema.safeParse({ ...base, schoolName: '', locationVisibility: 'anonymous' }).success).toBe(true);
  });

  it('description needs 100 visible characters; at most 5 screening questions', () => {
    expect(createVacancySchema.safeParse({ ...base, description: `<p>${'a'.repeat(99)}</p>` }).success).toBe(false);
    const six = Array.from({ length: 6 }, () => ({ question: 'Are you TRCN registered?' }));
    expect(createVacancySchema.safeParse({ ...base, screeningQuestions: six }).success).toBe(false);
  });

  it('edits apply no defaults, so untouched fields keep their stored values', () => {
    expect(updateVacancySchema.parse({ title: 'New title' })).toEqual({ title: 'New title' });
    expect(experienceUpdateSchema.parse({ role: 'Head of Physics' })).toEqual({ role: 'Head of Physics' });
  });
});
