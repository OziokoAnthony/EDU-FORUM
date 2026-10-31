import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Port Harcourt', 'port-harcourt'],
    ["Jama'are", 'jamaare'],
    ['Ado-Odo/Ota', 'ado-odo-ota'],
    ['  SS2 Physics Teacher!  ', 'ss2-physics-teacher'],
    ['Ọ̀yọ́', 'oyo'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});
