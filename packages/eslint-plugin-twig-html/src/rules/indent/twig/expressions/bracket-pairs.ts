import { createLastStartingLookup } from '../../range-lookup.js';
import type { BracketPair, LineContext } from './types.js';

export type BracketLookup = {
  readonly findClosedPair: (lineStart: number, contentStart: number) => BracketPair | undefined;
  readonly findEnclosingPair: (lineStart: number, contentStart: number) => BracketPair | undefined;
};

export const OUTSIDE_ANY_BRACKET = -1;

function closesAtOrBefore(pair: BracketPair | undefined, offset: number): pair is BracketPair {
  return pair !== undefined && pair[1] <= offset;
}

/**
 * Finds the innermost pair around each pair, in one pass that keeps a stack of the pairs still open.
 *
 * @param pairs - The bracket pairs of one block, sorted by opening bracket.
 * @returns A map from each pair to the innermost pair around it, or `undefined` for an outermost pair.
 */
function findPairAroundEachPair(pairs: readonly BracketPair[]): ReadonlyMap<BracketPair, BracketPair | undefined> {
  const pairAround = new Map<BracketPair, BracketPair | undefined>();
  const pairsStillOpen: BracketPair[] = [];

  for (const pair of pairs) {
    while (closesAtOrBefore(pairsStillOpen.at(-1), pair[0])) {
      pairsStillOpen.pop();
    }
    pairAround.set(pair, pairsStillOpen.at(-1));
    pairsStillOpen.push(pair);
  }

  return pairAround;
}

/**
 * Indexes a block's bracket pairs once, so each line finds its pairs without scanning them all.
 * The enclosing pair is found by starting at the last pair opened before the line and stepping out
 * to the pair around it until one is still open at the line's content.
 *
 * @param pairs - The bracket pairs of one block, sorted by opening bracket.
 * @returns `findClosedPair` for a line that starts by closing a pair, and `findEnclosingPair` for the innermost pair around a line.
 */
export function createBracketLookup(pairs: readonly BracketPair[]): BracketLookup {
  const pairByClose = new Map(pairs.map((pair) => [pair[1], pair]));
  const pairAround = findPairAroundEachPair(pairs);
  const findLastOpenedBefore = createLastStartingLookup(pairs, (pair) => pair[0] + 1);

  return {
    findClosedPair: (lineStart, contentStart) => {
      const pairClosedAtLineContent = pairByClose.get(contentStart);
      const isOpenedOnEarlierLine = pairClosedAtLineContent !== undefined && pairClosedAtLineContent[0] < lineStart;
      return isOpenedOnEarlierLine ? pairClosedAtLineContent : undefined;
    },
    findEnclosingPair: (lineStart, contentStart) => {
      let pair = findLastOpenedBefore(lineStart);
      while (closesAtOrBefore(pair, contentStart)) {
        pair = pairAround.get(pair);
      }
      return pair;
    },
  };
}

export function findClosedPair(line: LineContext): BracketPair | undefined {
  return line.brackets.findClosedPair(line.lineStart, line.contentStart);
}

export function findEnclosingPair(line: LineContext): BracketPair | undefined {
  return line.brackets.findEnclosingPair(line.lineStart, line.contentStart);
}

export function bracketLevelOf(line: LineContext): number {
  return findEnclosingPair(line)?.[0] ?? OUTSIDE_ANY_BRACKET;
}
