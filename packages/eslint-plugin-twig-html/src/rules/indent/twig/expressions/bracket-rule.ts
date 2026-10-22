import { findClosedPair, findEnclosingPair } from './bracket-pairs.js';
import type { LineContext, LineRule } from './types.js';

type BracketPair = LineContext['block']['bracketPairs'][number];

function isOneArgumentAmongSeveral(pair: BracketPair, line: LineContext): boolean {
  const { text, block } = line;
  const outerPair = block.bracketPairs.find(([open, close]) => open < pair[0] && pair[1] < close && !text.slice(open, pair[0]).includes('\n'));
  if (!outerPair) return false;

  const textAfterPair = text.slice(pair[1] + 1, outerPair[1]);
  return textAfterPair.replace(/[\s,]/g, '') !== '';
}

export const bracketRule: LineRule = (line) => {
  const closedPair = findClosedPair(line);
  if (closedPair) return isOneArgumentAmongSeveral(closedPair, line) ? undefined : line.indentationOfLineAt(closedPair[0]);

  const enclosingPair = findEnclosingPair(line);
  return enclosingPair && `${line.indentationOfLineAt(enclosingPair[0])}${line.unitText}`;
};
