import { RAW_TEXT_ELEMENT_NAMES, SINGLE_TOKEN_NODE_TYPES } from 'twig-eslint-parser';
import { WHITESPACE_SENSITIVE_ELEMENTS } from '../../../shared/html-elements.js';
import { elementNameSet } from '../../../shared/ignores.js';
import { lineIndentationAt } from '../../../shared/line-text.js';
import { isOpenTagUnreadable } from '../../../shared/unreadable-open-tags.js';
import { elementNameOf } from '../../../shared/tag-node.js';
import { interiorOf } from '../range-lookup.js';
import { bodyOf, flattenMarkup, isElement } from './html-elements.js';
import type { Range } from '../../../shared/range.js';
import type { TagSource } from '../../../shared/tag-source.js';
import type { RangeCoverage } from '../range-lookup.js';
import type { Element, MarkupNode, OpenTag } from './types.js';

export type HtmlSource = Pick<TagSource, 'text' | 'attributesOf' | 'unreadableTagStarts'> & {
  readonly ignores: readonly string[];
  readonly rawContentTags: readonly string[];
};

export type HtmlRegions = {
  readonly elements: readonly Element[];
  readonly nestings: readonly Range[];
  readonly skipped: readonly Range[];
  readonly unclosedContent: readonly Range[];
  readonly closeTags: readonly Range[];
};

function isDefined<Value>(value: Value | undefined): value is Value {
  return value !== undefined;
}

function findSkippedInElement(
  element: Element,
  unreadableTagStarts: ReadonlySet<number>,
  attributes: readonly { readonly range: Range }[],
  ignoredNames: ReadonlySet<string>,
  whitespaceSensitiveNames: ReadonlySet<string>,
): Range[] {
  const { openStart, openEnd, close } = element;
  const attributeInteriors = attributes.map((attribute) => interiorOf(attribute.range));

  if (!openEnd) return [[openStart.range[1], Infinity]];

  const isUnreadableOpenTag = isOpenTagUnreadable(element, unreadableTagStarts);
  if (isUnreadableOpenTag) return [[openStart.range[1], element.range[1]]];

  if (!close) return attributeInteriors;

  if (whitespaceSensitiveNames.has(elementNameOf(element))) return [...attributeInteriors, [openEnd.range[1], close.range[1]]];

  const isContentLeftAlone = Object.hasOwn(RAW_TEXT_ELEMENT_NAMES, element.type) || ignoredNames.has(elementNameOf(element));
  if (isContentLeftAlone) return [...attributeInteriors, [openEnd.range[1], close.range[0]]];

  return attributeInteriors;
}

function findTextLeftUnread(document: MarkupNode, text: string): Range[] {
  const treeEnd = document.range[1];
  return treeEnd < text.length ? [[treeEnd, Infinity]] : [];
}

function findUnclosedContent(element: Element): Range | undefined {
  const hasUnclosedChildren = !element.close && (element.children ?? []).length > 0;
  if (!element.openEnd || !hasUnclosedChildren) return undefined;
  return [element.openEnd.range[1], element.range[1]];
}

export function findHtmlRegions(document: MarkupNode, source: HtmlSource): HtmlRegions {
  const { attributesOf, unreadableTagStarts } = source;
  const ignoredNames = elementNameSet(source.ignores);
  const whitespaceSensitiveNames = elementNameSet([...WHITESPACE_SENSITIVE_ELEMENTS, ...source.rawContentTags]);
  const markupNodes = flattenMarkup(document.children ?? []);
  const elements = markupNodes.filter(isElement);

  const tokenInteriors = markupNodes.filter((node) => SINGLE_TOKEN_NODE_TYPES.includes(node.type)).map((node) => interiorOf(node.range));
  const elementSkips = elements.flatMap((element) => findSkippedInElement(element, unreadableTagStarts, attributesOf(element), ignoredNames, whitespaceSensitiveNames));

  return {
    elements,
    nestings: elements.map(bodyOf).filter(isDefined),
    skipped: [...tokenInteriors, ...elementSkips, ...findTextLeftUnread(document, source.text)],
    unclosedContent: elements.map(findUnclosedContent).filter(isDefined),
    closeTags: elements.flatMap((element) => (element.close ? [element.close.range] : [])),
  };
}

export function describeOpenTags(elements: readonly Element[], source: HtmlSource, depthUnknown: RangeCoverage): OpenTag[] {
  const { text, attributesOf } = source;

  return elements.flatMap((element): OpenTag[] => {
    if (!element.openEnd) return [];

    const attributes = attributesOf(element);
    const tagStart = element.openStart.range[0];
    const firstAttribute = attributes[0];
    const isFirstAttributeOnTagLine = firstAttribute !== undefined && !text.slice(tagStart, firstAttribute.range[0]).includes('\n');
    const isDepthUnknown = depthUnknown.covers(tagStart);

    return [{
      start: tagStart,
      attributesStart: element.openStart.range[1],
      closeBracketStart: element.openEnd.range[0],
      isSelfClosing: element.openEnd.value === '/>',
      firstAttributeColumn: isFirstAttributeOnTagLine ? firstAttribute.range[0] - tagStart : undefined,
      lineIndentationAsWritten: isDepthUnknown ? lineIndentationAt(text, tagStart) : undefined,
    }];
  });
}
