import { bracketLevelOf } from './bracket-pairs.js';
import type { LineRule } from './types.js';

const METHOD_CALL_START = /^\.[A-Za-z_]/;

export function isChainLine(text: string, contentStart: number): boolean {
  return METHOD_CALL_START.test(text.slice(contentStart, contentStart + 2));
}

export const chainRule: LineRule = (line) => {
  if (!isChainLine(line.text, line.contentStart)) {
    return undefined;
  }

  const headLineStart = line.chainHeads.get(bracketLevelOf(line));
  return headLineStart === undefined ? undefined : `${line.indentationOfLineAt(headLineStart)}${line.unitText}`;
};
