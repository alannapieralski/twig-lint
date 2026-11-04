import { depthChangeWithin } from 'twig-eslint-parser';
import { countAttributesGluedToTagName, findTagLineEnd } from '../../shared/tag-line.js';
import type { TwigBlockSummary } from 'twig-eslint-parser';
import type { Range } from '../../shared/range.js';
import type { TagNode } from '../../shared/tag-node.js';

export function groupAttributes(tag: TagNode, attributes: TagNode['attributes'], blocks: readonly TwigBlockSummary[]): Range[] {
  const groups: Range[] = [];
  let groupStart: number | undefined;
  const tagLine: Range = [tag.openStart.range[0], findTagLineEnd(tag.openStart.range[1], attributes)];
  let depth = depthChangeWithin(tagLine, blocks);

  for (const attribute of attributes.slice(countAttributesGluedToTagName(tag.openStart.range[1], attributes))) {
    groupStart ??= attribute.range[0];
    depth += depthChangeWithin(attribute.range, blocks);

    if (depth <= 0) {
      groups.push([groupStart, attribute.range[1]]);
      groupStart = undefined;
      depth = 0;
    }
  }

  const lastAttribute = attributes.at(-1);
  if (groupStart !== undefined && lastAttribute) {
    groups.push([groupStart, lastAttribute.range[1]]);
  }

  return groups;
}
