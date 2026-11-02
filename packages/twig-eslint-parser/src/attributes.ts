import type { Range } from './range.js';

type AttributeWrapper = { readonly value: string; readonly range: Range };

export type AttributeNode = {
  readonly type: 'Attribute';
  readonly range: [number, number];
  readonly key: { readonly value: string };
  readonly value?: { readonly value: string; readonly range: Range; readonly parts?: readonly { readonly type: string; readonly value: string }[] };
  readonly startWrapper?: AttributeWrapper;
  readonly endWrapper?: AttributeWrapper;
};

export type AttributeOwner = { readonly type: string; readonly attributes: readonly AttributeNode[] };

export type OmittedAttribute = { readonly name: string; readonly range: Range; readonly attribute: AttributeNode; readonly owner: AttributeOwner };

export function isAttributeNode(value: unknown): value is AttributeNode {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'Attribute';
}

export function containsTwig(attribute: AttributeNode): boolean {
  return attribute.value?.parts?.some((part) => part.type === 'Template') ?? false;
}

export function omitInterpolatedAttributes(root: unknown, attributeNames: ReadonlySet<string>): OmittedAttribute[] {
  if (attributeNames.size === 0) {
    return [];
  }

  const omitted: OmittedAttribute[] = [];
  const visited = new WeakSet<object>();
  const shouldOmit = (attribute: AttributeNode) => attributeNames.has(attribute.key.value.toLowerCase()) && containsTwig(attribute);

  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || visited.has(value)) {
      return;
    }
    visited.add(value);

    const node = value as Record<string, unknown>;
    const attributes = node['attributes'];
    if (Array.isArray(attributes) && attributes.every(isAttributeNode)) {
      const owner = node as unknown as AttributeOwner;
      for (const attribute of attributes.filter(shouldOmit)) {
        omitted.push({ name: attribute.key.value, range: attribute.range, attribute, owner });
      }
      node['attributes'] = attributes.filter((attribute) => !shouldOmit(attribute));
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== 'parent') {
        visit(child);
      }
    }
  };

  visit(root);
  return omitted.toSorted((first, second) => first.range[0] - second.range[0]);
}
