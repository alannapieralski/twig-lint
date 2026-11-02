import { ELEMENT_NODE_TYPES } from 'twig-eslint-parser';
import type { Range } from '../../../shared/range.js';
import type { Element, MarkupNode } from './types.js';

export function flattenMarkup(nodes: readonly MarkupNode[]): MarkupNode[] {
  const flattened: MarkupNode[] = [];
  const toVisit = [...nodes].reverse();

  for (let node = toVisit.pop(); node; node = toVisit.pop()) {
    flattened.push(node);
    for (const child of [...(node.children ?? [])].reverse()) toVisit.push(child);
  }

  return flattened;
}

export function isElement(node: MarkupNode): node is Element {
  return ELEMENT_NODE_TYPES.includes(node.type) && node.openStart !== undefined;
}

export function bodyOf(element: Element): Range | undefined {
  if (!element.openEnd || !element.close) return undefined;
  return [element.openEnd.range[1], element.close.range[0]];
}

export function extentOf(element: Element): Range {
  const lastToken = element.close ?? element.openEnd ?? element.openStart;
  return [element.openStart.range[0], lastToken.range[1]];
}

export function openTagOf(element: Element): Range {
  const openTagEnd = element.openEnd?.range[1] ?? element.range[1];
  return [element.openStart.range[0], openTagEnd];
}

