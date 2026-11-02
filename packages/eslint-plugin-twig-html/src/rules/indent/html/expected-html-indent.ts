import { repeatUnit } from '../options.js';
import { createLastStartingLookup } from '../range-lookup.js';
import type { Range } from '../../../shared/range.js';
import type { ResolvedOptions } from '../options.js';
import type { RangeCoverage } from '../range-lookup.js';
import type { OpenTag } from './types.js';

function isInsideOpenTag(tag: OpenTag, offset: number): boolean {
  return tag.attributesStart <= offset && offset <= tag.closeBracketStart;
}

function isInsideCloseTag(closeTag: Range, offset: number): boolean {
  return closeTag[0] < offset && offset < closeTag[1];
}

/**
 * Builds a lookup that finds the open tag whose attributes or closing bracket hold an offset.
 * Open tags never overlap, so only the last tag started at or before the offset can hold it.
 *
 * @param openTags - The open tags of the template, in any order.
 * @returns A function from an offset to the open tag holding it, or `undefined` when none does.
 */
export function createOpenTagLookup(openTags: readonly OpenTag[]): (offset: number) => OpenTag | undefined {
  const findLastTagStartedAtOrBefore = createLastStartingLookup(openTags, (tag) => tag.attributesStart);

  return (offset) => {
    const lastTagStarted = findLastTagStartedAtOrBefore(offset);
    return lastTagStarted && isInsideOpenTag(lastTagStarted, offset) ? lastTagStarted : undefined;
  };
}

/**
 * Builds a lookup that finds the close tag whose interior holds an offset.
 * Close tags never overlap, so only the last tag started before the offset can hold it.
 *
 * @param closeTags - The close tag ranges of the template, in any order.
 * @returns A function from an offset to the close tag holding it, or `undefined` when none does.
 */
export function createCloseTagLookup(closeTags: readonly Range[]): (offset: number) => Range | undefined {
  const findLastTagStartedBefore = createLastStartingLookup(closeTags, (closeTag) => closeTag[0] + 1);

  return (offset) => {
    const lastTagStarted = findLastTagStartedBefore(offset);
    return lastTagStarted && isInsideCloseTag(lastTagStarted, offset) ? lastTagStarted : undefined;
  };
}

export function expectedInOpenTag(tag: OpenTag, offset: number, nestings: RangeCoverage, options: ResolvedOptions): string {
  const { unit, closeBracket } = options;
  const tagDepth = nestings.countAt(tag.start);
  const tagIndentation = tag.lineIndentationAsWritten ?? repeatUnit(unit, tagDepth);

  if (offset === tag.closeBracketStart) {
    const bracketOffset = tag.isSelfClosing ? closeBracket.selfClosingTag : closeBracket.startTag;
    return `${tagIndentation}${repeatUnit(unit, bracketOffset)}`;
  }

  const depthWithinTag = nestings.countAt(offset) - tagDepth;
  const shouldAlign = options.alignAttributesVertically && tag.firstAttributeColumn !== undefined;
  if (!shouldAlign) return `${tagIndentation}${repeatUnit(unit, depthWithinTag + options.attribute)}`;

  const alignment = ' '.repeat(tag.firstAttributeColumn ?? 0);
  return `${tagIndentation}${alignment}${repeatUnit(unit, depthWithinTag)}`;
}

export function expectedInCloseTag(closeTag: Range, nestings: RangeCoverage, options: ResolvedOptions): string {
  return repeatUnit(options.unit, nestings.countAt(closeTag[0]) + options.closeBracket.endTag);
}
