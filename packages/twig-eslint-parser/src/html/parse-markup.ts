import { DRUPAL_VOID_ELEMENTS } from '../drupal.js';
import { createOffsetLocator } from '../source-text.js';
import { parseHtmlProgram, visitorKeys } from './program.js';
import { HtmlSyntaxError } from './syntax-error.js';
import { ESCAPABLE_RAW_TEXT_ELEMENT_NAMES } from './syntax.js';
import { templateInfosOf } from './template-infos.js';
import { maskVerbatimDelimiters, restoreVerbatimDelimiters } from './verbatim-text.js';
import type { TwigBlock } from '../twig/blocks.js';
import type { HtmlProgram } from './program.js';

type HtmlParseResult = { readonly ast: HtmlProgram; readonly visitorKeys: typeof visitorKeys };

function isPositionedSyntaxError(error: unknown): error is SyntaxError & { pos: number } {
  return error instanceof SyntaxError && typeof (error as { pos?: unknown }).pos === 'number';
}

export function parseMarkup(source: string, blocks: readonly TwigBlock[], rawContentTags: ReadonlySet<string>): HtmlParseResult {
  const verbatim = maskVerbatimDelimiters(source, blocks);
  const parseOptions = {
    templateInfos: templateInfosOf(blocks),
    rawContentTags: [...new Set([...ESCAPABLE_RAW_TEXT_ELEMENT_NAMES, ...rawContentTags])],
    voidElements: DRUPAL_VOID_ELEMENTS,
  };
  let result: HtmlParseResult;
  try {
    result = { ast: parseHtmlProgram(verbatim.text, parseOptions), visitorKeys };
  } catch (error) {
    if (!isPositionedSyntaxError(error)) {
      throw error;
    }
    const position = createOffsetLocator(source)(error.pos);
    throw new HtmlSyntaxError(error.message.replace(/ \(\d+:\d+\)$/, ''), position.line, position.column + 1);
  }
  if (verbatim.maskedRanges.length > 0) {
    restoreVerbatimDelimiters(result.ast, source, verbatim.maskedRanges);
  }
  return result;
}
