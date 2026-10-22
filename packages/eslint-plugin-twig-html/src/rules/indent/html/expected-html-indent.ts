import type { Range } from '../../../shared/range.js';
import { depthAt, repeatUnit } from '../nesting.js';
import type { ResolvedOptions } from '../options.js';
import type { IndentLayout } from '../types.js';
import type { OpenTag } from './types.js';

function isInsideOpenTag(tag: OpenTag, offset: number): boolean {
  return tag.attributesStart <= offset && offset <= tag.closeBracketStart;
}

function isInsideCloseTag(closeTag: Range, offset: number): boolean {
  return closeTag[0] < offset && offset < closeTag[1];
}

export function findOpenTagAt(offset: number, layout: IndentLayout): OpenTag | undefined {
  return layout.openTags.find((tag) => isInsideOpenTag(tag, offset));
}

export function findCloseTagAt(offset: number, layout: IndentLayout): Range | undefined {
  return layout.closeTags.find((range) => isInsideCloseTag(range, offset));
}

export function expectedInOpenTag(tag: OpenTag, offset: number, nestings: readonly Range[], options: ResolvedOptions): string {
  const { unit, closeBracket } = options;
  const tagDepth = depthAt(tag.start, nestings);
  const tagIndentation = tag.lineIndentationAsWritten ?? repeatUnit(unit, tagDepth);

  if (offset === tag.closeBracketStart) {
    const bracketOffset = tag.isSelfClosing ? closeBracket.selfClosingTag : closeBracket.startTag;
    return `${tagIndentation}${repeatUnit(unit, bracketOffset)}`;
  }

  const depthWithinTag = depthAt(offset, nestings) - tagDepth;
  const shouldAlign = options.alignAttributesVertically && tag.firstAttributeColumn !== undefined;
  if (!shouldAlign) return `${tagIndentation}${repeatUnit(unit, depthWithinTag + options.attribute)}`;

  const alignment = ' '.repeat(tag.firstAttributeColumn ?? 0);
  return `${tagIndentation}${alignment}${repeatUnit(unit, depthWithinTag)}`;
}

export function expectedInCloseTag(closeTag: Range, nestings: readonly Range[], options: ResolvedOptions): string {
  return repeatUnit(options.unit, depthAt(closeTag[0], nestings) + options.closeBracket.endTag);
}
