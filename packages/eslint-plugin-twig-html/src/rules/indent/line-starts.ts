import type { LineStart } from './types.js';

const leadingIndentation = /^[ \t]*/;

export function isBlankFrom(text: string, contentStart: number): boolean {
  const firstCharacter = text[contentStart];
  return firstCharacter === undefined || firstCharacter === '\n' || firstCharacter === '\r';
}

export function findLineStarts(text: string): LineStart[] {
  const lineStarts: LineStart[] = [];
  let lineStart = 0;

  for (const line of text.split('\n')) {
    const indentationLength = line.match(leadingIndentation)?.[0].length ?? 0;
    const contentStart = lineStart + indentationLength;

    if (!isBlankFrom(text, contentStart)) lineStarts.push({ lineStart, contentStart });

    lineStart += line.length + 1;
  }

  return lineStarts;
}
