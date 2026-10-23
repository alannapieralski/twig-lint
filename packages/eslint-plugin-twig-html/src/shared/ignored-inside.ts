import type { SourceCode } from 'eslint';
import { elementNameOf, type ParsedTag } from './tag-node.js';

type EslintNode = Parameters<SourceCode['getAncestors']>[0];

export function createIgnoredInsideCheck(sourceCode: SourceCode, ignores: readonly string[]): (tag: ParsedTag) => boolean {
  const ignoredElementNames = new Set(ignores.map((name) => name.toLowerCase()));

  return (tag) => {
    const tagAsEslintNode = tag as unknown as EslintNode;
    const enclosingNodes = sourceCode.getAncestors(tagAsEslintNode);
    const nodesToCheck = [...enclosingNodes, tagAsEslintNode];

    return nodesToCheck.some((candidate) => ignoredElementNames.has(elementNameOf(candidate as unknown as ParsedTag)));
  };
}
