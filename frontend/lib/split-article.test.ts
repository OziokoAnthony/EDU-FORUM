import { describe, expect, it } from 'vitest';
import { adPositions, topLevelBlocks } from './split-article';

describe('topLevelBlocks', () => {
  it('splits between top-level blocks and keeps lists and quotes whole', () => {
    const html = '<p>One</p><h2>Two</h2><ul><li><p>a</p></li><li><p>b</p></li></ul><blockquote><p>q</p><p>r</p></blockquote><p>End</p>';
    expect(topLevelBlocks(html)).toEqual(['<p>One</p>', '<h2>Two</h2>', '<ul><li><p>a</p></li><li><p>b</p></li></ul>', '<blockquote><p>q</p><p>r</p></blockquote>', '<p>End</p>']);
  });
});

describe('adPositions', () => {
  it('one ad per 3 blocks, at most 3, never after the last block', () => {
    expect(adPositions(2, 3)).toEqual([]);
    expect(adPositions(3, 3)).toEqual([1]);
    expect(adPositions(12, 3)).toEqual([2, 5, 8]);
    expect(adPositions(40, 3)).toHaveLength(3);
  });
});
