import { describe, expect, it } from 'vitest';
import { MATCH_WEIGHTS, teacherSearchSchema, vacancySearchSchema } from './search';

describe('search queries', () => {
  it('match weights total 100', () => {
    expect(Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('lists accept commas or repeats; defaults to page 1, 20 per page', () => {
    expect(vacancySearchSchema.parse({ subjects: 'physics, chemistry' })).toMatchObject({ subjects: ['physics', 'chemistry'], page: 1, limit: 20, sort: 'relevance' });
    expect(vacancySearchSchema.parse({ subjects: ['physics', 'biology'] }).subjects).toEqual(['physics', 'biology']);
  });

  it('radius is limited to 5/10/25/50 km and needs both coordinates', () => {
    expect(vacancySearchSchema.safeParse({ lat: '6.6', lng: '3.3', radiusKm: '10' }).success).toBe(true);
    expect(vacancySearchSchema.safeParse({ lat: '6.6', lng: '3.3', radiusKm: '7' }).success).toBe(false);
    expect(vacancySearchSchema.safeParse({ lat: '6.6' }).success).toBe(false);
    expect(vacancySearchSchema.safeParse({ limit: '51' }).success).toBe(false);
  });

  it('teacher search parses booleans and dates from the query string', () => {
    expect(teacherSearchSchema.parse({ willingToRelocate: 'true', availableBy: '2027-01-01' })).toMatchObject({ willingToRelocate: true, availableBy: '2027-01-01', sort: 'match' });
    expect(teacherSearchSchema.parse({}).willingToRelocate).toBeUndefined();
  });
});
