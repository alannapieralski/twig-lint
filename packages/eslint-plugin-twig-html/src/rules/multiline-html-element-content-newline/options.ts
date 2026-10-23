import { whitespaceSensitiveElements, inlineNonVoidElements } from '../../shared/html-elements.js';

export type Options = { ignores?: string[]; ignoreInlineElements?: boolean; ignoreWhenEmpty?: boolean; allowEmptyLines?: boolean };

const defaultOptions: Required<Options> = {
  ignores: [],
  ignoreInlineElements: true,
  ignoreWhenEmpty: true,
  allowEmptyLines: true,
};

export const optionsSchema = {
  type: 'object',
  properties: {
    allowEmptyLines: { type: 'boolean' },
    ignoreInlineElements: { type: 'boolean' },
    ignoreWhenEmpty: { type: 'boolean' },
    ignores: { type: 'array', items: { type: 'string' }, uniqueItems: true },
  },
  additionalProperties: false,
} as const;

export function resolveOptions(rawOptions: unknown): Required<Options> {
  return { ...defaultOptions, ...(rawOptions as Options | undefined) };
}

export function resolveSkippedElements(options: Required<Options>): string[] {
  const inlineElements = options.ignoreInlineElements ? inlineNonVoidElements : [];
  return [...whitespaceSensitiveElements, ...inlineElements, ...options.ignores];
}
