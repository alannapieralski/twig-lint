import type { Problem } from '../../shared/problem.js';
import { isOpenTagUnsound } from '../../shared/unsound-open-tags.js';
import type { AttributesOf } from '../../shared/tag-attributes.js';
import type { ParsedTag } from '../../shared/tag-node.js';
import { findAttributeProblems } from './find-attribute-problems.js';
import type { QuoteSource, TagWithAttributes } from './types.js';

export function findTagProblems(tag: TagWithAttributes, attributesOf: AttributesOf, source: QuoteSource, isSkipped: (tag: ParsedTag) => boolean): Problem[] {
  if (isSkipped(tag)) return [];

  const attributes = attributesOf(tag);
  const isInSoundTag = !isOpenTagUnsound(tag, source.unsoundTagStarts);

  return attributes.flatMap((attribute) => findAttributeProblems(attribute, isInSoundTag, source));
}
