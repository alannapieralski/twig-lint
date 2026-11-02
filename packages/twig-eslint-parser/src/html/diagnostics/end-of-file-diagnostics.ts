import { findLastNode, isMarkupElement } from './markup-elements.js';
import type { TwigDiagnostic } from '../../diagnostics.js';
import type { MarkupTreeNode } from './markup-elements.js';

const COMMENT_OPEN = '<!--';
const VISIBLE_CHARACTER = /\S/;

function isCommentCutOff(node: MarkupTreeNode): boolean {
  return node.type === 'Comment' && !node.close;
}

function findFirstVisibleOffset(text: string, from: number): number | undefined {
  const distance = text.slice(from).search(VISIBLE_CHARACTER);
  return distance === -1 ? undefined : from + distance;
}

function isTagCutOff(node: MarkupTreeNode): boolean {
  const isOpenTagCutOff = isMarkupElement(node) && !node.openEnd;
  const isDoctypeCutOff = node.type === 'Doctype' && !node.close;
  return isOpenTagCutOff || isDoctypeCutOff;
}

function findCutOffTagStart(document: MarkupTreeNode, lastNode: MarkupTreeNode, text: string): number | undefined {
  return isTagCutOff(lastNode) ? lastNode.range[0] : findFirstVisibleOffset(text, document.range[1]);
}

export function findEndOfFileDiagnostics(document: MarkupTreeNode, text: string): TwigDiagnostic[] {
  const lastNode = findLastNode(document);
  if (isCommentCutOff(lastNode)) {
    const commentStart = lastNode.range[0];
    return [{ code: 'eof-in-comment', message: 'This comment never ends with "-->", so the rest of the file is read as part of it. Add the "-->".', range: [commentStart, commentStart + COMMENT_OPEN.length] }];
  }

  const tagStart = findCutOffTagStart(document, lastNode, text);
  if (tagStart === undefined) {
    return [];
  }

  return [{ code: 'eof-in-tag', message: 'This tag never ends with ">", so the markup after it is read as part of the tag. Add the ">".', range: [tagStart, text.trimEnd().length] }];
}
