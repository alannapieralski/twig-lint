export type LayoutOptions = { ignores?: string[] };

export const layoutOptionDefaults: Required<LayoutOptions> = { ignores: ['svg'] };

export const layoutOptionProperties = {
  ignores: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
} as const;
