import { ELEMENT_NODE_TYPES } from 'twig-eslint-parser';

type EnclosedNode = { readonly type?: string; readonly close?: unknown; readonly parent?: EnclosedNode | null };

export function isInsideUnclosedElement(node: EnclosedNode): boolean {
  for (let enclosing = node.parent; enclosing; enclosing = enclosing.parent) {
    const isElement = ELEMENT_NODE_TYPES.includes(enclosing.type ?? '');
    if (isElement && !enclosing.close) {
      return true;
    }
  }

  return false;
}
