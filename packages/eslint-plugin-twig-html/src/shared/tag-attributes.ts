import type { AttributeNode, OmittedAttribute } from 'twig-eslint-parser';
import type { Range } from './range.js';

type RangedAttribute = { readonly range: Range };

export type AttributesOf = <Attribute extends RangedAttribute>(tag: { readonly attributes?: readonly Attribute[] }) => readonly (Attribute | AttributeNode)[];

function byStart(first: RangedAttribute, second: RangedAttribute): number {
  return first.range[0] - second.range[0];
}

export function createAttributesOf(omittedAttributes: readonly OmittedAttribute[]): AttributesOf {
  const omittedByOwner = new Map<object, OmittedAttribute[]>();
  for (const omitted of omittedAttributes) {
    omittedByOwner.set(omitted.owner, [...(omittedByOwner.get(omitted.owner) ?? []), omitted]);
  }

  return (tag) => {
    const attributesInTree = tag.attributes ?? [];
    const omitted = omittedByOwner.get(tag);
    if (!omitted) return attributesInTree;

    return [...attributesInTree, ...omitted.map(({ attribute }) => attribute)].toSorted(byStart);
  };
}
