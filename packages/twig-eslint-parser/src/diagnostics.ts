import type { Range } from './range.js';

export const DIAGNOSTIC_CODES = [
  'duplicate-attribute',
  'eof-in-comment',
  'eof-in-tag',
  'unexpected-character-in-attribute-name',
  'unexpected-character-in-unquoted-attribute-value',
  'unexpected-solidus-in-tag',
  'x-invalid-end-tag',
  'x-misplaced-twig-tag',
  'x-unclosed-element',
  'x-unparsed-twig',
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export type TwigDiagnostic = {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly range: Range;
};

export function compareDiagnostics(first: TwigDiagnostic, second: TwigDiagnostic): number {
  return first.range[0] - second.range[0] || first.range[1] - second.range[1] || first.code.localeCompare(second.code);
}
