import { isClosingTag, isMiddleTag, isOpeningTag } from './block-roles.js';
import { TAGS_WITH_VARYING_MARKUP } from './syntax.js';
import type { Range } from '../range.js';
import type { TwigBlockSummary } from './blocks.js';

function findFirstIndexStartingFrom<Item>(items: readonly Item[], offset: number, startOf: (item: Item) => number): number {
  let low = 0;
  let high = items.length;

  while (low < high) {
    const middle = (low + high) >> 1;
    const middleItem = items[middle];
    const middleStart = middleItem === undefined ? Infinity : startOf(middleItem);

    if (middleStart < offset) low = middle + 1;
    else high = middle;
  }

  return low;
}

export function* findBlocksWithin(range: Range, blocks: readonly TwigBlockSummary[]): Generator<TwigBlockSummary> {
  for (let index = findFirstIndexStartingFrom(blocks, range[0], (block) => block.range[0]); index < blocks.length; index += 1) {
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
    const isMiddleTagAtTopLevel = depth === 0 && isMiddleTag(block);
    if (isMiddleTagAtTopLevel) return false;

    depth += block.depthChange;
    if (depth < 0) return false;
  }

  return depth === 0;
}

function opensVaryingMarkup(block: TwigBlockSummary): boolean {
  return isOpeningTag(block) && TAGS_WITH_VARYING_MARKUP.has(block.tagName ?? '');
}

function closesVaryingMarkup(block: TwigBlockSummary): boolean {
  return isClosingTag(block) && TAGS_WITH_VARYING_MARKUP.has(block.tagName?.slice('end'.length) ?? '');
}

export function isSameOnEveryTwigBranch(range: Range, blocks: readonly TwigBlockSummary[]): boolean {
  let depth = 0;
  let branchDepth = 0;

  for (const block of findBlocksWithin(range, blocks)) {
    const isInTagOpenedBefore = depth === 0;
    if (isMiddleTag(block) && isInTagOpenedBefore) return false;
    if (isClosingTag(block) && isInTagOpenedBefore && closesVaryingMarkup(block)) return false;

    if (isOpeningTag(block)) depth += 1;
    if (opensVaryingMarkup(block)) branchDepth += 1;
    if (!isClosingTag(block) || isInTagOpenedBefore) continue;

    depth -= 1;
    if (closesVaryingMarkup(block)) branchDepth -= 1;
  }

  return branchDepth === 0;
}

export function findTwigBranchSpans(blocks: readonly TwigBlockSummary[]): Range[] {
  const spans: Range[] = [];
  let branchDepth = 0;
  let spanStart = 0;

  for (const block of blocks) {
    if (opensVaryingMarkup(block) && branchDepth === 0) spanStart = block.range[0];
    if (opensVaryingMarkup(block)) branchDepth += 1;
    if (!closesVaryingMarkup(block)) continue;

    branchDepth -= 1;
    if (branchDepth === 0) spans.push([spanStart, block.range[1]]);
  }

  return spans;
}

export function isInsideTwigBranch(offset: number, branchSpans: readonly Range[]): boolean {
  const firstSpanIndexAtOrAfter = findFirstIndexStartingFrom(branchSpans, offset, (span) => span[0]);
  const lastSpanStartingBefore = branchSpans[firstSpanIndexAtOrAfter - 1];

  return lastSpanStartingBefore !== undefined && offset < lastSpanStartingBefore[1];
}
