import { parseExpression } from './expression-grammar.js';
import { decodeTwigString } from './string-value.js';
import { advance, createIdentifier, createNode, createNumberLiteral, currentToken, expect, isAt, nextIf, outerEndOf, outerStartOf, parseDelimitedList, tokenAfterCurrent, TwigGrammarError, viewCurrentToken } from './token-stream.js';
import type { EstreeNode } from '../estree.js';
import type { TwigTokenStream } from './token-stream.js';

type QuotedString = { readonly node: EstreeNode; readonly endsWithText: boolean };
type StringPart = { readonly raw: string; readonly start: number; readonly end: number };

function createStringNode(stream: TwigTokenStream, parts: readonly StringPart[], expressions: readonly EstreeNode[], options: { readonly start: number; readonly end: number; readonly isKey: boolean; readonly source: string }): EstreeNode {
  const hasJavaScriptSyntax = parts.some((part) => part.raw.includes('`') || part.raw.includes('${'));
  const isPlainValue = expressions.length === 0 && (options.isKey || hasJavaScriptSyntax);
  if (isPlainValue) {
    const text = parts.map((part) => part.raw).join('');
    return createNode(stream, 'Literal', options.start, options.end, { value: decodeTwigString(text), raw: options.source });
  }
  const quasis = parts.map((part, partIndex) => createNode(stream, 'TemplateElement', part.start, part.end, {
    value: { raw: part.raw, cooked: decodeTwigString(part.raw) },
    tail: partIndex === parts.length - 1,
  }));
  return createNode(stream, 'TemplateLiteral', options.start, options.end, { quasis, expressions });
}

function parseQuotedString(stream: TwigTokenStream, isKey: boolean): QuotedString {
  const openingIndex = stream.index;
  const opening = advance(stream);
  const parts: StringPart[] = [];
  const expressions: EstreeNode[] = [];
  let raw = '';
  let partStart = opening.start;
  let endsWithText = true;

  while (currentToken(stream).type !== 'CLOSING_QUOTE') {
    const text = nextIf(stream, 'string');
    if (text) {
      raw += text.value;
      endsWithText = true;
      continue;
    }
    const interpolation = expect(stream, 'begin of string interpolation');
    parts.push({ raw, start: partStart, end: interpolation.end });
    expressions.push(parseExpression(stream));
    partStart = expect(stream, 'end of string interpolation').start;
    raw = '';
    endsWithText = false;
  }
  const closing = advance(stream);
  parts.push({ raw, start: partStart, end: closing.end });
  const source = stream.tokens.slice(openingIndex, stream.index).map((token) => token.value).join('');
  const node = createStringNode(stream, parts, expressions, { start: opening.start, end: closing.end, isKey, source });
  return { node, endsWithText };
}

function startsWithText(stream: TwigTokenStream): boolean {
  return tokenAfterCurrent(stream)?.type !== 'INTERPOLATION_START';
}

export function parseStringExpression(stream: TwigTokenStream): EstreeNode {
  const strings: EstreeNode[] = [];
  let canTakeText = true;
  while (currentToken(stream).type === 'OPENING_QUOTE' && (canTakeText || !startsWithText(stream))) {
    const quoted = parseQuotedString(stream, false);
    strings.push(quoted.node);
    canTakeText = !quoted.endsWithText;
  }
  const [first, ...rest] = strings as [EstreeNode, ...EstreeNode[]];
  return rest.reduce((left, right) => createNode(stream, 'BinaryExpression', left.start, right.end, { operator: '+', left, right }), first);
}

export function parseSequence(stream: TwigTokenStream): EstreeNode {
  const opening = advance(stream);
  const elements = parseDelimitedList<EstreeNode | null>(stream, ']', 'A sequence element must be followed by a comma', () => (isAt(stream, 'punctuation', ',') ? null : parseExpression(stream)));
  const closing = expect(stream, 'punctuation', ']', 'An opened sequence is not properly closed');
  return createNode(stream, 'ArrayExpression', opening.start, closing.end, { elements });
}

function isInterpolatedStringAt(stream: TwigTokenStream): boolean {
  for (let index = stream.index + 1; index < stream.tokens.length; index += 1) {
    const type = stream.tokens[index]?.type;
    if (type === 'INTERPOLATION_START') {
      return true;
    }
    if (type === 'CLOSING_QUOTE') {
      return false;
    }
  }
  return false;
}

function parseMappingKey(stream: TwigTokenStream): { readonly key: EstreeNode; readonly isComputed: boolean } {
  const view = viewCurrentToken(stream);
  if (view.type === 'string') {
    if (isInterpolatedStringAt(stream)) {
      throw new TwigGrammarError('A mapping key must be followed by a colon (:). Unexpected token "begin of string interpolation" ("punctuation" expected with value ":").');
    }
    return { key: parseQuotedString(stream, true).node, isComputed: false };
  }
  if (view.type === 'number') {
    return { key: createNumberLiteral(stream, advance(stream)), isComputed: false };
  }
  if (view.type === 'operator' && view.value === '(') {
    return { key: parseExpression(stream), isComputed: true };
  }
  throw new TwigGrammarError(`A mapping key must be a quoted string, a number, a name, or an expression enclosed in parentheses (unexpected token "${view.type}" of value "${view.value}".`);
}

function parseProperty(stream: TwigTokenStream): EstreeNode {
  const name = nextIf(stream, 'name');
  if (name && (isAt(stream, 'punctuation', ',') || isAt(stream, 'punctuation', '}'))) {
    return createNode(stream, 'Property', name.start, name.end, { key: createIdentifier(stream, name), value: createIdentifier(stream, name), kind: 'init', method: false, shorthand: true, computed: false });
  }
  const { key, isComputed } = name ? { key: createIdentifier(stream, name), isComputed: false } : parseMappingKey(stream);
  expect(stream, 'punctuation', ':', 'A mapping key must be followed by a colon (:)');
  const value = parseExpression(stream);
  return createNode(stream, 'Property', outerStartOf(stream, key), outerEndOf(stream, value), { key, value, kind: 'init', method: false, shorthand: false, computed: isComputed });
}

export function parseMapping(stream: TwigTokenStream): EstreeNode {
  const opening = advance(stream);
  const properties = parseDelimitedList(stream, '}', 'A mapping value must be followed by a comma', () => (isAt(stream, 'operator', '...') ? parseExpression(stream) : parseProperty(stream)));
  const closing = expect(stream, 'punctuation', '}', 'An opened mapping is not properly closed');
  return createNode(stream, 'ObjectExpression', opening.start, closing.end, { properties });
}
