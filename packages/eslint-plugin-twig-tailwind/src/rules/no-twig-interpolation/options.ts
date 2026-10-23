export type Options = { attributes?: string[] };

export type ResolvedOptions = { readonly restrictedNames: ReadonlySet<string> };

const defaultAttributeNames = ['class'];

export const optionsSchema = {
  type: 'object',
  properties: { attributes: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true } },
  additionalProperties: false,
} as const;

export function resolveOptions(rawOptions: unknown): ResolvedOptions {
  const { attributes = defaultAttributeNames } = (rawOptions ?? {}) as Options;
  return { restrictedNames: new Set(attributes.map((name) => name.toLowerCase())) };
}
