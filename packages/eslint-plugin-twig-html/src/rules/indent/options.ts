import { ignoresSchema } from '../../shared/ignores.js';

export type IndentSize = number | 'tab';

export type CloseBracketOffsets = { startTag?: number; endTag?: number; selfClosingTag?: number };

export type Options = {
  attribute?: number;
  closeBracket?: number | CloseBracketOffsets;
  alignAttributesVertically?: boolean;
  ignores?: string[];
};

export type IndentUnit = { readonly text: string; readonly name: 'space' | 'tab' };

export type ResolvedOptions = {
  readonly unit: IndentUnit;
  readonly attribute: number;
  readonly closeBracket: Required<CloseBracketOffsets>;
  readonly alignAttributesVertically: boolean;
  readonly ignores: readonly string[];
};

const DEFAULT_INDENT_SIZE = 2;

const offsetSchema = { type: 'integer', minimum: 0 } as const;

export const indentSizeSchema = { anyOf: [{ type: 'integer', minimum: 1 }, { enum: ['tab'] }] } as const;

export const optionsSchema = {
  type: 'object',
  properties: {
    alignAttributesVertically: { type: 'boolean' },
    attribute: offsetSchema,
    closeBracket: {
      anyOf: [
        offsetSchema,
        {
          type: 'object',
          properties: { endTag: offsetSchema, selfClosingTag: offsetSchema, startTag: offsetSchema },
          additionalProperties: false,
        },
      ],
    },
    ignores: ignoresSchema,
  },
  additionalProperties: false,
} as const;

function resolveUnit(indentSize: IndentSize | undefined): IndentUnit {
  if (indentSize === 'tab') return { text: '\t', name: 'tab' };
  return { text: ' '.repeat(indentSize ?? DEFAULT_INDENT_SIZE), name: 'space' };
}

export function repeatUnit(unit: IndentUnit, depth: number): string {
  return unit.text.repeat(Math.max(depth, 0));
}

function resolveCloseBracket(closeBracket: Options['closeBracket']): Required<CloseBracketOffsets> {
  if (typeof closeBracket === 'number') return { startTag: closeBracket, endTag: closeBracket, selfClosingTag: closeBracket };
  return { startTag: 0, endTag: 0, selfClosingTag: 0, ...closeBracket };
}

export function resolveOptions(rawIndentSize: unknown, rawOptions: unknown): ResolvedOptions {
  const options = (rawOptions ?? {}) as Options;

  return {
    unit: resolveUnit(rawIndentSize as IndentSize | undefined),
    attribute: options.attribute ?? 1,
    closeBracket: resolveCloseBracket(options.closeBracket),
    alignAttributesVertically: options.alignAttributesVertically ?? true,
    ignores: options.ignores ?? [],
  };
}
