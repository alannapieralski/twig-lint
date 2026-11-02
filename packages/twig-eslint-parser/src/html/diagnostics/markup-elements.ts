import { ELEMENT_NODE_TYPES } from '../syntax.js';
import type { AttributeNode } from '../../attributes.js';
import type { TokenTypes } from '../../es-html-parser/constants/token-types.js';
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

export type SourceToken = { readonly type: string; readonly range: Range; readonly value: string; readonly parts?: { type: TokenTypes; value: string }[] };

export function isMarkupElement(node: MarkupTreeNode): node is MarkupElement {
  return ELEMENT_NODE_TYPES.includes(node.type) && 'openStart' in node;
}

export function openTagRangeOf(element: MarkupElement): Range {
  return [element.openStart.range[0], element.openEnd?.range[1] ?? element.openStart.range[1]];
}

export function openTagTextOf(element: MarkupElement, text: string): string {
  return `${text.slice(...element.openStart.range)}>`;
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

export function findLastNode(document: MarkupTreeNode): MarkupTreeNode {
  let lastNode = document;

  for (let lastChild = document.children?.at(-1); lastChild; lastChild = lastChild.children?.at(-1)) {
    lastNode = lastChild;
  }

  return lastNode;
}

function findChildOpenAt(node: MarkupTreeNode, offset: number, openUntil: number): { element: MarkupElement; openUntil: number } | undefined {
  for (const child of node.children ?? []) {
    if (!isMarkupElement(child) || !child.openEnd || child.selfClosing) {
      continue;
    }

    const childOpenUntil = child.close?.range[0] ?? openUntil;
    const isOpenAtOffset = child.openEnd.range[1] <= offset && offset < childOpenUntil;
    if (isOpenAtOffset) {
      return { element: child, openUntil: childOpenUntil };
    }
  }

  return undefined;
}

export function findInnermostOpenElement(document: MarkupTreeNode, offset: number): MarkupElement | undefined {
  let innermost: MarkupElement | undefined;
  let openChild = findChildOpenAt(document, offset, Infinity);

  while (openChild) {
    innermost = openChild.element;
    openChild = findChildOpenAt(openChild.element, offset, openChild.openUntil);
  }

  return innermost;
}
