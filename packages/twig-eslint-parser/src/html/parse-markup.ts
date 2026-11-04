import { DRUPAL_VOID_ELEMENTS } from '../drupal.js';
import { parseHtmlDocument, visitorKeys } from './program.js';
import { ESCAPABLE_RAW_TEXT_ELEMENT_NAMES } from './syntax.js';
import { templateInfosOf } from './template-infos.js';
import { maskVerbatimDelimiters, restoreVerbatimDelimiters } from './verbatim-text.js';
import type { TwigBlock } from '../twig/blocks.js';
import type { ParseError } from '../es-html-parser/types/index.js';
import type { HtmlProgram } from './program.js';

type HtmlParseResult = { readonly ast: HtmlProgram; readonly visitorKeys: typeof visitorKeys; readonly errors: readonly ParseError[] };

export function parseMarkup(source: string, blocks: readonly TwigBlock[], rawContentTags: ReadonlySet<string>): HtmlParseResult {
  const verbatim = maskVerbatimDelimiters(source, blocks);
  const parseOptions = {
    templateInfos: templateInfosOf(blocks),
    rawContentTags: [...new Set([...ESCAPABLE_RAW_TEXT_ELEMENT_NAMES, ...rawContentTags])],
    voidElements: DRUPAL_VOID_ELEMENTS,
  };
  const { program, errors } = parseHtmlDocument(verbatim.text, parseOptions);
  if (verbatim.maskedRanges.length > 0) {
    restoreVerbatimDelimiters(program, source, verbatim.maskedRanges);
  }
  return { ast: program, visitorKeys, errors };
}
