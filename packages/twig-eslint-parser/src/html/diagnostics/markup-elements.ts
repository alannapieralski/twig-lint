import { ELEMENT_NODE_TYPES } from '../syntax.js';
import type { AttributeNode } from '../../attributes.js';
import type { Range } from '../../range.js';

type MarkupToken = { readonly range: Range; readonly value: string };

export type MarkupTreeNode = { readonly type: string; readonly range: Range; readonly close?: MarkupToken | null; readonly children?: readonly MarkupTreeNode[] };

export type MarkupElement = MarkupTreeNode & {
  readonly name?: string;
  readonly openStart: MarkupToken;
  readonly openEnd?: MarkupToken;
  readonly selfClosing?: boolean;
  readonly attributes: readonly AttributeNode[];
};

export function isMarkupElement(node: MarkupTreeNode): node is MarkupElement {
  return ELEMENT_NODE_TYPES.includes(node.type) && 'openStart' in node;
}

export function openTagRangeOf(element: MarkupElement): Range {
  return [element.openStart.range[0], element.openEnd?.range[1] ?? element.openStart.range[1]];
}

export function findMarkupElements(document: MarkupTreeNode): MarkupElement[] {
  const elements: MarkupElement[] = [];
  const toVisit = [document];

  for (let node = toVisit.pop(); node; node = toVisit.pop()) {
    if (isMarkupElement(node)) {
      elements.push(node);
    }
    toVisit.push(...(node.children ?? []));
  }

  return elements;
}
