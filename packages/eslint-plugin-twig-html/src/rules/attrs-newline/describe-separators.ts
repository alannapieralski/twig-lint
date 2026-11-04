import { lineIndentationAt } from '../../shared/line-text.js';
import type { Range } from '../../shared/range.js';
import type { TagNode } from '../../shared/tag-node.js';
import type { CloseStyle } from './options.js';
import type { AttributeSeparator } from './types.js';

export function describeSeparators(tag: TagNode, groups: readonly Range[], text: string, lineBreak: string, closeStyle: CloseStyle): AttributeSeparator[] {
  const selfClosingSpace = tag.openEnd.value === '/>' ? ' ' : '';
  const isClosingOnOwnLine = closeStyle === 'newline';
  const lineBreakAtTagIndentation = `${lineBreak}${lineIndentationAt(text, tag.openStart.range[0])}`;

  const boundaries = [tag.openStart.range[1], ...groups.flatMap(([start, end]) => [start, end]), tag.openEnd.range[0]];
  const separators: AttributeSeparator[] = [];

  for (let index = 0; index < boundaries.length; index += 2) {
    const isClosing = index === boundaries.length - 2;
    const isLineBreak = !isClosing || isClosingOnOwnLine;
    const range: Range = [boundaries[index] as number, boundaries[index + 1] as number];
    separators.push({ range, expected: isLineBreak ? lineBreakAtTagIndentation : selfClosingSpace, isClosing, isLineBreak });
  }

  return separators;
}
