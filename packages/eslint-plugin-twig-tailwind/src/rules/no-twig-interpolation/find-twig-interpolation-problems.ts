import { containsTwig, isAttributeNode, type AttributeNode, type OmittedAttribute, type TwigStringSummary } from 'twig-eslint-parser';
import type { Problem } from '../../shared/problem.js';
import type { Range } from '../../shared/range.js';
import type { ResolvedOptions } from './options.js';
import type { TagWithAttributes } from './types.js';

function describeProblem(name: string, range: Range): Problem {
  return { range, messageId: 'twigInAttribute', data: { name } };
}

export function findInterpolatedAttributeProblems(tag: TagWithAttributes, options: ResolvedOptions): Problem[] {
  const attributes = (tag.attributes ?? []).filter(isAttributeNode);
  const isInterpolated = (attribute: AttributeNode) => options.restrictedNames.has(attribute.key.value.toLowerCase()) && containsTwig(attribute);
  const interpolatedAttributes = attributes.filter(isInterpolated);

  return interpolatedAttributes.map((attribute) => describeProblem(attribute.key.value, attribute.range));
}

export function findOmittedAttributeProblems(omittedAttributes: readonly OmittedAttribute[], options: ResolvedOptions): Problem[] {
  const restrictedAttributes = omittedAttributes.filter((attribute) => options.restrictedNames.has(attribute.name.toLowerCase()));

  return restrictedAttributes.map((attribute) => describeProblem(attribute.name, attribute.range));
}

export function findInterpolatedStringProblems(strings: readonly TwigStringSummary[]): Problem[] {
  const interpolatedStrings = strings.filter((string) => string.isInterpolated);

  return interpolatedStrings.map((string) => ({ range: string.range, messageId: 'twigInString', data: {} }));
}
