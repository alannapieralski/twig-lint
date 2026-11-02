export type SourcePosition = { line: number; column: number };
export type SourceLocation = { start: SourcePosition; end: SourcePosition };

const LINE_BREAK_PATTERN = /\r\n|[\r\n\u2028\u2029]/g;

export function createOffsetLocator(source: string): (offset: number) => SourcePosition {
  const lineStartOffsets = [0];
  for (const lineBreak of source.matchAll(LINE_BREAK_PATTERN)) {
    lineStartOffsets.push(lineBreak.index + lineBreak[0].length);
  }

  return (offset) => {
    let lowestLine = 0;
    let highestLine = lineStartOffsets.length - 1;
    while (lowestLine < highestLine) {
      const middleLine = (lowestLine + highestLine + 1) >> 1;
      if ((lineStartOffsets[middleLine] ?? 0) <= offset) {
        lowestLine = middleLine;
      } else {
        highestLine = middleLine - 1;
      }
    }
    return { line: lowestLine + 1, column: offset - (lineStartOffsets[lowestLine] ?? 0) };
  };
}

export function blankPreservingLineBreaks(text: string): string {
  return text.replace(/[^\r\n\u2028\u2029]/g, ' ');
}
