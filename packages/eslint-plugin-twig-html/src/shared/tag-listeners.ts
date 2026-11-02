import { isTwigBalancedWithin } from 'twig-eslint-parser';
import type { Rule } from 'eslint';
import type { ParsedTag, TagNode } from './tag-node.js';
import type { TagSource } from './tag-source.js';

export function tagListeners<Tag extends ParsedTag>(check: (tag: Tag) => void, nodeTypes: readonly string[], source: TagSource): Rule.RuleListener {
  const checkOutsideTransBodies = (tag: Tag) => {
    if (!source.isInsideTransBody(tag.openStart.range[0])) {
      check(tag);
    }
  };

  const listeners = Object.fromEntries(nodeTypes.map((nodeType) => [nodeType, checkOutsideTransBodies]));
  return listeners as unknown as Rule.RuleListener;
}

export function balancedTagListeners(check: (tag: TagNode) => void, nodeTypes: readonly string[], source: TagSource): Rule.RuleListener {
  const isTerminated = (tag: ParsedTag): tag is TagNode => tag.openEnd !== undefined;
  const isSameOnEveryBranch = (tag: TagNode) => isTwigBalancedWithin([tag.openStart.range[0], tag.openEnd.range[1]], source.blocks);

  const checkBalancedTag = (tag: ParsedTag) => {
    if (isTerminated(tag) && isSameOnEveryBranch(tag)) {
      check(tag);
    }
  };

  return tagListeners(checkBalancedTag, nodeTypes, source);
}
