import type { TwigDiagnostic } from 'twig-eslint-parser';
import type { Problem } from '../../shared/problem.js';
import type { Options } from './options.js';

export function findParseErrorProblems(diagnostics: readonly TwigDiagnostic[], options: Required<Options>): Problem[] {
  return diagnostics
    .filter((diagnostic) => options[diagnostic.code])
    .map((diagnostic) => ({ range: diagnostic.range, messageId: 'parseError', data: { message: diagnostic.message, code: diagnostic.code } }));
}
