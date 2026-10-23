import type { DiagnosticCode, TwigDiagnostic } from 'twig-eslint-parser';
import type { ParsedTag } from './tag-node.js';

const codesOfUnsoundTags: ReadonlySet<DiagnosticCode> = new Set(['eof-in-tag', 'unexpected-character-in-attribute-name', 'unexpected-character-in-unquoted-attribute-value']);

export function findUnsoundTagStarts(diagnostics: readonly TwigDiagnostic[]): ReadonlySet<number> {
  return new Set(diagnostics.filter((diagnostic) => codesOfUnsoundTags.has(diagnostic.code)).map((diagnostic) => diagnostic.range[0]));
}

export function isOpenTagUnsound(tag: Pick<ParsedTag, 'openStart'>, unsoundTagStarts: ReadonlySet<number>): boolean {
  return unsoundTagStarts.has(tag.openStart.range[0]);
}
