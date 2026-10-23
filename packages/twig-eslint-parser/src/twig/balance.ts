import type { TwigBlockSummary } from './blocks.js';

type Range = readonly [number, number];

const branchContinuations: ReadonlySet<string> = new Set(['else', 'elseif']);

function firstBlockIndexFrom(offset: number, blocks: readonly TwigBlockSummary[]): number {
  let low = 0;
  let high = blocks.length;

  while (low < high) {
    const middle = (low + high) >> 1;
    const middleStart = blocks[middle]?.range[0] ?? Infinity;

    if (middleStart < offset) low = middle + 1;
    else high = middle;
  }

  return low;
}

function* findBlocksWithin(range: Range, blocks: readonly TwigBlockSummary[]): Generator<TwigBlockSummary> {
  for (let index = firstBlockIndexFrom(range[0], blocks); index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block || block.range[1] > range[1]) return;
    yield block;
  }
}

export function depthChangeWithin(range: Range, blocks: readonly TwigBlockSummary[]): number {
  let depth = 0;

  for (const block of findBlocksWithin(range, blocks)) depth += block.depthChange;

  return depth;
}

export function isTwigBalancedWithin(range: Range, blocks: readonly TwigBlockSummary[]): boolean {
  let depth = 0;

  for (const block of findBlocksWithin(range, blocks)) {
    const isBranchContinuationAtTopLevel = depth === 0 && branchContinuations.has(block.tagName ?? '');
    if (isBranchContinuationAtTopLevel) return false;

    depth += block.depthChange;
    if (depth < 0) return false;
  }

  return depth === 0;
}
