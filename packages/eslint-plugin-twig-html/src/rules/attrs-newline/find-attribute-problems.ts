import { isOpenTagSwallowingMarkup } from '../../shared/swallowed-markup.js';
import type { Problem } from '../../shared/problem.js';
import type { Range } from '../../shared/range.js';
import type { TagNode } from '../../shared/tag-node.js';
import { describeSeparators } from './describe-separators.js';
import { groupAttributes } from './group-attributes.js';
import type { CloseStyle, Options } from './options.js';
import type { TagSource } from '../../shared/tag-source.js';
import type { AttributeSeparator } from './types.js';

const whitespaceOnly = /^\s*$/;
const ignoredIndentation = /^[ \t]*$/;

function isSeparatorCorrect(separatorText: string, separator: AttributeSeparator, lineBreak: string): boolean {
  if (!separator.isLineBreak) return separatorText === separator.expected;
  return separatorText.startsWith(lineBreak) && ignoredIndentation.test(separatorText.slice(lineBreak.length));
}

function messageIdForSeparator(separator: AttributeSeparator, closeStyle: CloseStyle): string {
  if (!separator.isClosing) return 'attributeLine';
  return closeStyle === 'newline' ? 'closeOnOwnLine' : 'closeAfterLastAttribute';
}

function findReportedEnd(separator: AttributeSeparator, tag: TagNode, groups: readonly Range[]): number {
  if (separator.isClosing) return tag.openEnd.range[1];

  const groupAfterSeparator = groups.find(([start]) => start === separator.range[1]);
  return groupAfterSeparator?.[1] ?? separator.range[1];
}

export function findAttributeProblems(tag: TagNode, source: TagSource, options: Required<Options>): Problem[] {
  const { text, lineBreak, blocks, attributesOf, isIgnored } = source;
  const attributes = attributesOf(tag);
  const groups = groupAttributes(tag, attributes, blocks);
  if (groups.length <= options.ifAttrsMoreThan || isIgnored(tag)) return [];

  const separators = describeSeparators(tag, groups, text, lineBreak, options.closeStyle);
  const wrongSeparators = separators.filter((separator) => !isSeparatorCorrect(text.slice(...separator.range), separator, lineBreak));
  const firstWrongSeparator = wrongSeparators[0];
  if (!firstWrongSeparator) return [];

  const areAllSeparatorsWhitespace = separators.every((separator) => whitespaceOnly.test(text.slice(...separator.range)));
  const isFixable = areAllSeparatorsWhitespace && !isOpenTagSwallowingMarkup({ openEnd: tag.openEnd, attributes }, text);

  return [{
    range: [firstWrongSeparator.range[1], findReportedEnd(firstWrongSeparator, tag, groups)],
    messageId: messageIdForSeparator(firstWrongSeparator, options.closeStyle),
    data: { close: tag.openEnd.value },
    ...(isFixable && { edits: wrongSeparators.map((separator) => ({ range: separator.range, text: separator.expected })) }),
  }];
}
