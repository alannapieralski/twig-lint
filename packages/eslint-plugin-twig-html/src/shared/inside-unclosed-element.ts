import { ELEMENT_NODE_TYPES } from 'twig-eslint-parser';
import type { SourceCode } from 'eslint';
import type { ParsedTag } from './tag-node.js';

type EslintNode = Parameters<SourceCode['getAncestors']>[0];

export function createInsideUnclosedElementCheck(sourceCode: SourceCode): (tag: ParsedTag) => boolean {
  return (tag) => {
    const enclosingNodes = sourceCode.getAncestors(tag as unknown as EslintNode) as unknown as ParsedTag[];
    const enclosingElements = enclosingNodes.filter((node) => ELEMENT_NODE_TYPES.includes(node.type ?? ''));

    return enclosingElements.some((element) => !element.close);
  };
}
