/**
 * Splits cleaned blog HTML into top-level blocks (paragraphs, headings, lists, quotes) so ads
 * can sit between them, never inside a list or quote.
 */
export function topLevelBlocks(html: string): string[] {
  const blocks: string[] = [];
  const tag = /<(\/?)(p|h2|h3|ul|ol|blockquote)\b[^>]*>/gi;
  let depth = 0;
  let start = 0;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    if (m[1]) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        blocks.push(html.slice(start, tag.lastIndex));
        start = tag.lastIndex;
      }
    } else {
      depth++;
    }
  }
  const rest = html.slice(start).trim();
  if (rest) blocks.push(rest);
  return blocks.filter((b) => b.trim());
}

/** After which blocks to put in-article ads: one per 3 blocks, at most `max`, evenly spread, never last. */
export function adPositions(blockCount: number, max: number): number[] {
  const n = Math.min(max, Math.floor(blockCount / 3));
  const out: number[] = [];
  for (let i = 1; i <= n; i++) out.push(Math.round((blockCount * i) / (n + 1)) - 1);
  return [...new Set(out)].filter((p) => p >= 0 && p < blockCount - 1);
}
