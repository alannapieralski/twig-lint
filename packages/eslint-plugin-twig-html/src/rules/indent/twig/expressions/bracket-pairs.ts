import type { LineContext } from './types.js';

type BracketPair = LineContext['block']['bracketPairs'][number];

export const outsideAnyBracket = -1;

export function findClosedPair(line: LineContext): BracketPair | undefined {
  return line.block.bracketPairs.find(([open, close]) => close === line.contentStart && open < line.lineStart);
}

export function findEnclosingPair(line: LineContext): BracketPair | undefined {
  const enclosing = line.block.bracketPairs.filter(([open, close]) => open < line.lineStart && line.contentStart < close);
  return enclosing.at(-1);
}

export function bracketLevelOf(line: LineContext): number {
  return findEnclosingPair(line)?.[0] ?? outsideAnyBracket;
}
