export const diagnosticCodes = [
  'eof-in-tag',
  'unexpected-character-in-attribute-name',
  'unexpected-character-in-unquoted-attribute-value',
  'x-invalid-end-tag',
  'x-misplaced-twig-tag',
  'x-unclosed-element',
  'x-unparsed-twig',
] as const;

export type DiagnosticCode = (typeof diagnosticCodes)[number];

export type TwigDiagnostic = {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly range: readonly [number, number];
};

export function compareDiagnostics(first: TwigDiagnostic, second: TwigDiagnostic): number {
  return first.range[0] - second.range[0] || first.range[1] - second.range[1] || first.code.localeCompare(second.code);
}
