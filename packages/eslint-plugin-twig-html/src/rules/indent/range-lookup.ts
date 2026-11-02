import type { Range } from '../../shared/range.js';

export type RangeCoverage = {
  readonly countAt: (offset: number) => number;
  readonly covers: (offset: number) => boolean;
};

function byOffset(first: number, second: number): number {
  return first - second;
}

function isEmpty(range: Range): boolean {
  return range[1] <= range[0];
}

/**
 * Counts how many offsets in an ascending list are at or before an offset, by binary search.
 *
 * @param sortedOffsets - The offsets to count, in ascending order.
 * @param offset - The offset to count up to, inclusive.
 * @returns How many of `sortedOffsets` are at or before `offset`.
 */
function countAtOrBefore(sortedOffsets: readonly number[], offset: number): number {
  let low = 0;
  let high = sortedOffsets.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const isMiddleAtOrBefore = (sortedOffsets[middle] ?? Infinity) <= offset;

    if (isMiddleAtOrBefore) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

/**
 * Narrows a range to the offsets after its first one, so an offset on an opening delimiter is outside it.
 *
 * @param range - The range, including its opening delimiter.
 * @returns The range without its first offset.
 */
export function interiorOf(range: Range): Range {
  return [range[0] + 1, range[1]];
}

/**
 * Builds a lookup that counts the ranges containing an offset.
 * A range contains an offset when it starts at or before it and ends after it, so the count is the
 * ranges started at or before the offset, less the ranges already ended by it.
 *
 * @param ranges - The ranges to count, each including its start and excluding its end. Empty ranges are ignored.
 * @returns `countAt`, the number of ranges containing an offset, and `covers`, whether any range contains it.
 */
export function createRangeCoverage(ranges: readonly Range[]): RangeCoverage {
  const nonEmptyRanges = ranges.filter((range) => !isEmpty(range));
  const sortedStarts = nonEmptyRanges.map((range) => range[0]).sort(byOffset);
  const sortedEnds = nonEmptyRanges.map((range) => range[1]).sort(byOffset);
  const countAt = (offset: number) => countAtOrBefore(sortedStarts, offset) - countAtOrBefore(sortedEnds, offset);

  return { countAt, covers: (offset) => countAt(offset) > 0 };
}

/**
 * Builds a lookup that finds the item with the latest start at or before an offset.
 * The item found is not checked to contain the offset. The caller checks that.
 *
 * @param items - The items to search, in any order.
 * @param startOf - Reads the offset an item starts at.
 * @returns A function from an offset to the last item started at or before it, or `undefined` when none has.
 */
export function createLastStartingLookup<Item>(items: readonly Item[], startOf: (item: Item) => number): (offset: number) => Item | undefined {
  const sortedItems = items.toSorted((first, second) => startOf(first) - startOf(second));
  const sortedStarts = sortedItems.map(startOf);

  return (offset) => sortedItems[countAtOrBefore(sortedStarts, offset) - 1];
}
