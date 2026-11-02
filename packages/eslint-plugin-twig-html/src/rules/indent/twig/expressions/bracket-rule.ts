import { findClosedPair, findEnclosingPair } from './bracket-pairs.js';
import type { BracketPair, LineContext, LineRule } from './types.js';

const SEPARATORS_AND_WHITESPACE = /[\s,]/g;

function isOneArgumentAmongSeveral(pair: BracketPair, line: LineContext): boolean {
  const { text, block } = line;
  const [pairOpen, pairClose] = pair;
  const isAroundPair = ([open, close]: BracketPair) => open < pairOpen && pairClose < close;
  const isOpenedOnSameLine = ([open]: BracketPair) => !text.slice(open, pairOpen).includes('\n');
  const outerPairsOpenedOnTheSameLine = block.bracketPairs.filter((outerPair) => isAroundPair(outerPair) && isOpenedOnSameLine(outerPair));
  const outerPair = outerPairsOpenedOnTheSameLine.at(-1);
  if (!outerPair) {
    return false;
  }

  const textAfterPair = text.slice(pairClose + 1, outerPair[1]);
  return textAfterPair.replace(SEPARATORS_AND_WHITESPACE, '') !== '';
}

export const bracketRule: LineRule = (line) => {
  const closedPair = findClosedPair(line);
  if (closedPair) {
    return isOneArgumentAmongSeveral(closedPair, line) ? undefined : line.indentationOfLineAt(closedPair[0]);
  }
  if (line.continuesPreviousLine) {
    return undefined;
  }

  const enclosingPair = findEnclosingPair(line);
  return enclosingPair && `${line.indentationOfLineAt(enclosingPair[0])}${line.unitText}`;
};
