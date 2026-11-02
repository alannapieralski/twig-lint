import { TWIG_DELIMITERS } from '../twig/syntax.js';
import type { TwigBlock } from '../twig/blocks.js';
import type { Range } from '../range.js';

export type VerbatimMaskedText = { readonly text: string; readonly maskedRanges: readonly Range[] };

function isRange(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number';
}

function overlaps([start, end]: Range, ranges: readonly Range[]): boolean {
  return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && rangeStart < end);
}

function findVerbatimBodies(blocks: readonly TwigBlock[]): Range[] {
  const bodies: Range[] = [];
  let bodyStart: number | undefined;
  for (const block of blocks) {
    if (block.tagName === 'verbatim') {
      bodyStart = block.end;
    }
    if (block.tagName === 'endverbatim' && bodyStart !== undefined) {
      bodies.push([bodyStart, block.start]);
      bodyStart = undefined;
    }
  }
  return bodies;
}

// Blanks the Twig delimiters that {% verbatim %} prints as text, so the HTML reader does not take them for part of a tag or attribute name.
export function maskVerbatimDelimiters(source: string, blocks: readonly TwigBlock[]): VerbatimMaskedText {
  let text = source;
  const maskedRanges: Range[] = [];
  for (const [start, end] of findVerbatimBodies(blocks)) {
    const body = source.slice(start, end);
    const masked = body.replace(TWIG_DELIMITERS, '  ');
    if (masked === body) {
      continue;
    }
    text = text.slice(0, start) + masked + text.slice(end);
    maskedRanges.push([start, end]);
  }
  return { text, maskedRanges };
}

export function restoreVerbatimDelimiters(tree: unknown, source: string, maskedRanges: readonly Range[]): void {
  const visited = new Set<object>();
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || visited.has(value)) {
      return;
    }
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    const range = node['range'];
    if (isRange(range) && typeof node['value'] === 'string' && overlaps(range, maskedRanges) && node['value'].length === range[1] - range[0]) {
      node['value'] = source.slice(...range);
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== 'range' && key !== 'loc' && key !== 'parent') {
        visit(child);
      }
    }
  };
  visit(tree);
}
