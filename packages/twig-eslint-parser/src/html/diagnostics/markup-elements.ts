import type { AttributeNode } from '../../attributes.js';

type Range = readonly [number, number];
type MarkupToken = { readonly range: Range; readonly value: string };

export type MarkupNode = { readonly type: string; readonly children?: readonly MarkupNode[] };

export type MarkupElement = MarkupNode & {
  readonly name?: string;
  readonly range: Range;
  readonly openStart: MarkupToken;
  readonly openEnd?: MarkupToken;
  readonly close?: MarkupToken | null;
  readonly selfClosing?: boolean;
  readonly attributes: readonly AttributeNode[];
};

export type SourceToken = { readonly type: string; readonly range: Range; readonly value: string };

const elementNodeTypes: ReadonlySet<string> = new Set(['Tag', 'ScriptTag', 'StyleTag']);

function isMarkupElement(node: MarkupNode): node is MarkupElement {
  return elementNodeTypes.has(node.type) && 'openStart' in node;
}

export function findMarkupElements(document: MarkupNode): MarkupElement[] {
  const elements: MarkupElement[] = [];
  const toVisit = [document];

  for (let node = toVisit.pop(); node; node = toVisit.pop()) {
    if (isMarkupElement(node)) elements.push(node);
    toVisit.push(...(node.children ?? []));
  }

  return elements;
}
