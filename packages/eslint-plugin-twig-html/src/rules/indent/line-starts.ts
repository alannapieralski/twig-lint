import { indentationOf } from '../../shared/line-text.js';
import type { LineStart } from './types.js';

export function isBlankFrom(text: string, contentStart: number): boolean {
  const firstCharacter = text[contentStart];
  return firstCharacter === undefined || firstCharacter === '\n' || firstCharacter === '\r';
}

export function findLineStarts(text: string): LineStart[] {
  const lineStarts: LineStart[] = [];
  let lineStart = 0;

  for (const line of text.split('\n')) {
    const indentationLength = indentationOf(line).length;
    const contentStart = lineStart + indentationLength;

    if (!isBlankFrom(text, contentStart)) {
      lineStarts.push({ lineStart, contentStart });
    }

    lineStart += line.length + 1;
  }

  return lineStarts;
}
