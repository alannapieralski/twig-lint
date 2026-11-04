import { namePattern } from '../lexer/Lexer.js';
import { PUNCTUATION_NAMED_AS_OPERATOR } from './operators.js';
import { decodeTwigString } from './string-value.js';
import { isSignificant } from './tokens.js';
import type { EstreeNode } from '../estree.js';
import type { Range } from '../range.js';
import type { SourcePosition } from '../source-text.js';
import type { TwigBlock } from './blocks.js';
import type { TwigToken } from './tokens.js';

export type TwigTokenStream = {
  readonly block: TwigBlock;
  readonly tokens: readonly TwigToken[];
  readonly locate: (offset: number) => SourcePosition;
  readonly parenthesisedRanges: WeakMap<EstreeNode, Range>;
  index: number;
};

export type TwigTokenView = { readonly type: string; readonly value: string };

export class TwigGrammarError extends Error {}

const STARTS_WITH_NAME = new RegExp(`^(?:${namePattern})`);
const IS_NAME = new RegExp(`^(?:${namePattern})$`);
const PCRE_WHITESPACE = /[ \t\n\v\f\r]+/g;

const TWIG_TYPE_BY_TOKEN_TYPE: Readonly<Partial<Record<string, string>>> = {
  NAME: 'name',
  NUMBER: 'number',
  OPERATOR: 'operator',
  TEST_OPERATOR: 'operator',
  ARROW: 'operator',
  SPREAD_OPERATOR: 'operator',
  VARIABLE_END: 'end of print statement',
  TAG_END: 'end of statement block',
  INTERPOLATION_START: 'begin of string interpolation',
  INTERPOLATION_END: 'end of string interpolation',
};

export function createTokenStream(block: TwigBlock, locate: (offset: number) => SourcePosition): TwigTokenStream {
  return { block, tokens: block.tokens.filter(isSignificant).slice(1), locate, parenthesisedRanges: new WeakMap(), index: 0 };
}

export function currentToken(stream: TwigTokenStream): TwigToken {
  const token = stream.tokens[stream.index];
  if (!token) {
    throw new Error('The Twig grammar read past the end of its block.');
  }
  return token;
}

export function tokenAfterCurrent(stream: TwigTokenStream): TwigToken | undefined {
  return stream.tokens[stream.index + 1];
}

export function advance(stream: TwigTokenStream): TwigToken {
  const token = currentToken(stream);
  stream.index += 1;
  return token;
}

function viewOfOpeningQuote(stream: TwigTokenStream): TwigTokenView {
  const firstPart = tokenAfterCurrent(stream);
  if (firstPart?.type === 'INTERPOLATION_START') {
    return { type: 'begin of string interpolation', value: '' };
  }
  return { type: 'string', value: decodeTwigString(firstPart?.type === 'STRING' ? firstPart.value : '') };
}

function twigNumberValue(source: string): string {
  return String(Number(source.replace(/_/g, '')));
}

/**
 * Describes the current token as Twig's own lexer would name it, which is what Twig's messages quote.
 *
 * @param stream - The block being read.
 * @returns Twig's token type in English and Twig's token value.
 */
export function viewCurrentToken(stream: TwigTokenStream): TwigTokenView {
  const token = currentToken(stream);
  if (token.type === 'OPENING_QUOTE') {
    return viewOfOpeningQuote(stream);
  }
  if (token.type === 'PUNCTUATION') {
    return { type: PUNCTUATION_NAMED_AS_OPERATOR.has(token.value) ? 'operator' : 'punctuation', value: token.value };
  }
  if (token.type === 'NUMBER') {
    return { type: 'number', value: twigNumberValue(token.value) };
  }
  if (token.type === 'STRING') {
    return { type: 'string', value: decodeTwigString(token.value) };
  }
  const type = TWIG_TYPE_BY_TOKEN_TYPE[token.type] ?? token.type.toLowerCase();
  const isDelimiter = token.type === 'VARIABLE_END' || token.type === 'TAG_END' || token.type.startsWith('INTERPOLATION');
  return { type, value: isDelimiter ? '' : token.value.replace(PCRE_WHITESPACE, ' ') };
}

export function isAt(stream: TwigTokenStream, type: string, value?: string): boolean {
  const view = viewCurrentToken(stream);
  return view.type === type && (value === undefined || view.value === value);
}

export function nextIf(stream: TwigTokenStream, type: string, value?: string): TwigToken | undefined {
  return isAt(stream, type, value) ? advance(stream) : undefined;
}

function isShownInTwigMessages(value: string): boolean {
  return value !== '' && value !== '0';
}

export function describeUnexpectedToken(stream: TwigTokenStream): string {
  const view = viewCurrentToken(stream);
  return `Unexpected token "${view.type}" of value "${view.value}".`;
}

/**
 * Consumes the current token if it has the type and value given, and otherwise fails with the message Twig's TokenStream::expect() gives.
 *
 * @param stream - The block being read.
 * @param type - Twig's token type in English, such as "punctuation".
 * @param value - The value the token must have, if any.
 * @param message - The sentence Twig puts before the description of the token, if any.
 * @returns The consumed token.
 */
export function expect(stream: TwigTokenStream, type: string, value?: string, message?: string): TwigToken {
  if (isAt(stream, type, value)) {
    return advance(stream);
  }
  const view = viewCurrentToken(stream);
  const prefix = message ? `${message}. ` : '';
  const actualValue = isShownInTwigMessages(view.value) ? ` of value "${view.value}"` : '';
  const expectedValue = value ? ` with value "${value}"` : '';
  throw new TwigGrammarError(`${prefix}Unexpected token "${view.type}"${actualValue} ("${type}" expected${expectedValue}).`);
}

export function isWholeName(value: string): boolean {
  return IS_NAME.test(value);
}

export function startsWithName(value: string): boolean {
  return STARTS_WITH_NAME.test(value);
}

export function createNode(stream: TwigTokenStream, type: string, start: number, end: number, fields: Record<string, unknown> = {}): EstreeNode {
  return { type, start, end, range: [start, end], loc: { start: stream.locate(start), end: stream.locate(end) }, ...fields };
}

export function outerStartOf(stream: TwigTokenStream, node: EstreeNode): number {
  return stream.parenthesisedRanges.get(node)?.[0] ?? node.start;
}

export function outerEndOf(stream: TwigTokenStream, node: EstreeNode): number {
  return stream.parenthesisedRanges.get(node)?.[1] ?? node.end;
}

export function createIdentifier(stream: TwigTokenStream, token: TwigToken): EstreeNode {
  return createNode(stream, 'Identifier', token.start, token.end, { name: token.value });
}

export function createNumberLiteral(stream: TwigTokenStream, token: TwigToken): EstreeNode {
  return createNode(stream, 'Literal', token.start, token.end, { value: Number(token.value.replace(/_/g, '')), raw: token.value });
}

/**
 * Reads items separated by commas up to, but not including, a closing punctuation character, allowing one trailing comma.
 *
 * @param stream - The block being read.
 * @param closing - The punctuation character that ends the list.
 * @param separatorMessage - The sentence Twig puts before its error when a comma is missing.
 * @param parseItem - Reads one item.
 * @returns The items read.
 */
export function parseDelimitedList<T>(stream: TwigTokenStream, closing: string, separatorMessage: string, parseItem: () => T): T[] {
  const items: T[] = [];
  while (!isAt(stream, 'punctuation', closing)) {
    if (items.length > 0) {
      expect(stream, 'punctuation', ',', separatorMessage);
      if (isAt(stream, 'punctuation', closing)) {
        break;
      }
    }
    items.push(parseItem());
  }
  return items;
}
