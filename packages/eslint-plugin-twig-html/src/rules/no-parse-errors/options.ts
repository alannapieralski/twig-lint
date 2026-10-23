import { diagnosticCodes, type DiagnosticCode } from 'twig-eslint-parser';

export type Options = { [Code in DiagnosticCode]?: boolean };

export const defaultOptions: Required<Options> = Object.fromEntries(diagnosticCodes.map((code) => [code, true])) as Required<Options>;

export const optionsSchema = {
  type: 'object',
  properties: Object.fromEntries(diagnosticCodes.map((code) => [code, { type: 'boolean' }])),
  additionalProperties: false,
} as const;

export function resolveOptions(rawOptions: unknown): Required<Options> {
  return { ...defaultOptions, ...(rawOptions as Options | undefined) };
}
