import { bracketLevelOf } from './bracket-pairs.js';
import type { LineRule } from './types.js';

const methodCallStart = /^\.[A-Za-z_]/;

export function isChainLine(text: string, contentStart: number): boolean {
  return methodCallStart.test(text.slice(contentStart, contentStart + 2));
}

export const chainRule: LineRule = (line) => {
  if (!isChainLine(line.text, line.contentStart)) return undefined;

  const headLineStart = line.chainHeads.get(bracketLevelOf(line));
  return headLineStart === undefined ? undefined : `${line.indentationOfLineAt(headLineStart)}${line.unitText}`;
};
