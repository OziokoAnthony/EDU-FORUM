import { describe, expect, it } from 'vitest';
import { safeNext } from './next-path';

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/teacher/cv?tab=history')).toBe('/teacher/cv?tab=history');
  });

  it('drops anything that could leave the site', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, undefined]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
