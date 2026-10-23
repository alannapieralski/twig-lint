import type { Rule } from 'eslint';
import { isTwigBalancedWithin, type TwigBlockSummary } from 'twig-eslint-parser';
import type { ParsedTag, TagNode } from './tag-node.js';

export function tagListeners<Tag>(check: (tag: Tag) => void, nodeTypes: readonly string[]): Rule.RuleListener {
  const listeners = Object.fromEntries(nodeTypes.map((nodeType) => [nodeType, check]));
  return listeners as unknown as Rule.RuleListener;
}

export function balancedTagListeners(check: (tag: TagNode) => void, nodeTypes: readonly string[], blocks: readonly TwigBlockSummary[]): Rule.RuleListener {
  const isTerminated = (tag: ParsedTag): tag is TagNode => tag.openEnd !== undefined;
  const isSameOnEveryBranch = (tag: TagNode) => isTwigBalancedWithin([tag.openStart.range[0], tag.openEnd.range[1]], blocks);

  const checkBalancedTag = (tag: ParsedTag) => {
    if (isTerminated(tag) && isSameOnEveryBranch(tag)) check(tag);
  };

  return tagListeners(checkBalancedTag, nodeTypes);
}
