import type { SourceCode } from 'eslint';
import type { TagNode } from './tag-node.js';

type EslintNode = Parameters<SourceCode['getAncestors']>[0];

function normaliseElementName(name: string | undefined): string {
  return (name ?? '').toLowerCase();
}

export function createIgnoredInsideCheck(sourceCode: SourceCode, ignores: readonly string[]): (tag: TagNode) => boolean {
  const ignoredElementNames = new Set(ignores.map(normaliseElementName));

  return (tag) => {
    const tagAsEslintNode = tag as unknown as EslintNode;
    const enclosingNodes = sourceCode.getAncestors(tagAsEslintNode);
    const nodesToCheck = [...enclosingNodes, tagAsEslintNode];

    return nodesToCheck.some((candidate) => {
      const candidateName = (candidate as unknown as TagNode).name;
      return ignoredElementNames.has(normaliseElementName(candidateName));
    });
  };
}
