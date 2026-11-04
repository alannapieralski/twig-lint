import type { ParseError } from './es-html-parser/types/index.js';
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

export type MarkupErrorMessages = { readonly [Code in ParseError['code']]: (error: Extract<ParseError, { code: Code }>, text: string) => string };

function openTagTextOf(element: { readonly openStart: { readonly range: Range } }, text: string): string {
  return `${text.slice(...element.openStart.range)}>`;
}

function describeInvalidEndTag(error: Extract<ParseError, { code: 'x-invalid-end-tag' }>, text: string): string {
  const writtenEndTag = text.slice(...error.range);
  if (error.selfClosedElement) {
    const writtenTag = `${text.slice(...error.selfClosedElement.openStart.range)} … />`;
    return `${writtenEndTag} closes nothing, because the ${writtenTag} before it already ended with "/>". Remove the "/" there or remove this closing tag.`;
  }
  if (!error.openElement) {
    return `${writtenEndTag} closes nothing, because no element is open. Remove it or add the opening tag.`;
  }
  return `${writtenEndTag} does not match the open ${openTagTextOf(error.openElement, text)}. Remove it or correct its name.`;
}

export const MARKUP_ERROR_MESSAGES: MarkupErrorMessages = {
  'duplicate-attribute': (error, text) => `The attribute "${text.slice(...error.range).toLowerCase()}" is already set on this tag. Browsers ignore every one after the first.`,
  'eof-in-comment': () => 'This comment never ends with "-->", so the rest of the file is read as part of it. Add the "-->".',
  'eof-in-tag': () => 'This tag never ends with ">", so the markup after it is read as part of the tag. Add the ">".',
  'unexpected-character-in-attribute-name': () => 'An attribute name contains a quote or "<", so an attribute value was probably quoted wrongly. Check the quotes before it.',
  'unexpected-character-in-unquoted-attribute-value': () => 'An unquoted attribute value contains a quote or "<", so the tag takes in the markup after it. Quote the value or close the tag.',
  'unexpected-solidus-in-tag': () => 'A "/" in this tag is not followed by ">", so it is ignored. Remove it, or add ">" after it if the tag ends there.',
  'x-invalid-end-tag': describeInvalidEndTag,
  'x-unclosed-element': (error, text) => `${openTagTextOf(error.element, text)} is never closed. Add its closing tag.`,
};
