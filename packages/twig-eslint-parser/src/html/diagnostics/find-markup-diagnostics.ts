import { MARKUP_ERROR_MESSAGES } from '../../diagnostics.js';
import { findMarkupElements, openTagRangeOf } from './markup-elements.js';
import { applyTwigPolicy } from './twig-policy.js';
import type { TwigDiagnostic } from '../../diagnostics.js';
import type { ParseError } from '../../es-html-parser/types/index.js';
import type { Range } from '../../range.js';
import type { TwigBlockSummary } from '../../twig/blocks.js';
import type { MarkupElement, MarkupTreeNode } from './markup-elements.js';

export type MarkupDiagnosticsSource = {
  readonly errors: readonly ParseError[];
  readonly document: MarkupTreeNode;
  readonly text: string;
  readonly blocks: readonly TwigBlockSummary[];
};
export type MarkupDiagnostics = { readonly diagnostics: TwigDiagnostic[]; readonly unreadableTagStarts: readonly number[] };

type OpenTagError = Extract<ParseError, { tagStart: number }>;
type ReadingError = Exclude<OpenTagError, { code: 'duplicate-attribute' }>;

function isReadingError(error: ParseError): error is ReadingError {
  return 'tagStart' in error && error.code !== 'duplicate-attribute';
}

function selectOneErrorPerTag(readingErrors: readonly ReadingError[]): ReadingError[] {
  const selectedByTagStart = new Map<number, ReadingError>();
  for (const error of readingErrors) {
    const selected = selectedByTagStart.get(error.tagStart);
    if (!selected || (error.code === 'eof-in-tag' && selected.code !== 'eof-in-tag')) {
      selectedByTagStart.set(error.tagStart, error);
    }
  }
  return [...selectedByTagStart.values()];
}

function findAttributeRange(element: MarkupElement | undefined, keyRange: Range): Range {
  const attribute = element?.attributes.find((candidate) => candidate.range[0] === keyRange[0]);
  return attribute?.range ?? keyRange;
}

function findDisplayRange(error: ParseError, text: string, elementsByTagStart: ReadonlyMap<number, MarkupElement>): Range {
  if (error.code === 'eof-in-tag') {
    return [error.tagStart, text.trimEnd().length];
  }
  if (error.code === 'duplicate-attribute') {
    return findAttributeRange(elementsByTagStart.get(error.tagStart), error.range);
  }
  if (isReadingError(error)) {
    const element = elementsByTagStart.get(error.tagStart);
    return element ? openTagRangeOf(element) : error.range;
  }
  return error.range;
}

function describeError(error: ParseError, text: string, elementsByTagStart: ReadonlyMap<number, MarkupElement>): TwigDiagnostic {
  const describe = MARKUP_ERROR_MESSAGES[error.code] as (error: ParseError, text: string) => string;
  return { code: error.code, message: describe(error, text), range: findDisplayRange(error, text, elementsByTagStart) };
}

/**
 * Turns the HTML parser's errors into diagnostics: one reading error per open tag, duplicates only on tags read cleanly,
 * and only the errors the Twig policy keeps.
 *
 * @param source - The parser's errors, the markup tree, the template text and its Twig blocks.
 * @returns The diagnostics, and the start of every open tag that could not be read.
 */
export function findMarkupDiagnostics(source: MarkupDiagnosticsSource): MarkupDiagnostics {
  const elements = findMarkupElements(source.document);
  const elementsByTagStart = new Map(elements.map((element) => [element.openStart.range[0], element]));
  const readingErrors = source.errors.filter(isReadingError);
  const unreadableTagStarts = new Set(readingErrors.map((error) => error.tagStart));
  const isOnReadableTag = (error: ParseError) => error.code !== 'duplicate-attribute' || !unreadableTagStarts.has(error.tagStart);
  const otherErrors = source.errors.filter((error) => !isReadingError(error)).filter(isOnReadableTag);
  const reportedErrors = applyTwigPolicy([...selectOneErrorPerTag(readingErrors), ...otherErrors], { text: source.text, blocks: source.blocks, elements, elementsByTagStart });

  return {
    diagnostics: reportedErrors.map((error) => describeError(error, source.text, elementsByTagStart)),
    unreadableTagStarts: [...unreadableTagStarts],
  };
}
