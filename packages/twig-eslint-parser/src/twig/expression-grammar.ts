import { ARROW_PRECEDENCE, BINARY_OPERATORS, POSTFIX_PRECEDENCE, PREFIX_OPERATORS, TERNARY_PRECEDENCE, TEST_PRECEDENCE } from './operators.js';
import { decodeTwigString } from './string-value.js';
import { TESTS_WITH_ONE_MANDATORY_ARGUMENT } from './syntax.js';
import {
  advance,
  createNode,
  currentToken,
  describeUnexpectedToken,
  expect,
  isAt,
  isWholeName,
  nextIf,
  outerEndOf,
  outerStartOf,
  startsWithName,
  tokenAfterCurrent,
  TwigGrammarError,
  viewCurrentToken,
} from './token-stream.js';
import type { EstreeNode } from '../estree.js';
import type { BinaryOperator } from './operators.js';
import type { TwigTokenStream } from './token-stream.js';
import type { TwigToken } from './tokens.js';

type ParsedArguments = { readonly args: EstreeNode[]; readonly end: number };
type QuotedString = { readonly node: EstreeNode; readonly endsWithText: boolean };
type StringPart = { readonly raw: string; readonly start: number; readonly end: number };

const ARROW_PARAMETERS = 'TwigArrowParameters';
const ARROW_ARGUMENT_MESSAGE = 'The arrow function argument must be a list of variables or a single variable.';
const POSTFIX_OPERATORS: ReadonlySet<string> = new Set(['.', '?.', '|', '(', '[']);
const LITERAL_VALUE_BY_NAME: Readonly<Record<string, boolean | null>> = { true: true, TRUE: true, false: false, FALSE: false, none: null, NONE: null, null: null, NULL: null };
const TWIG_CLASS_BY_NODE_TYPE: Readonly<Partial<Record<string, string>>> = {
  Literal: 'Twig\\Node\\Expression\\ConstantExpression',
  TemplateLiteral: 'Twig\\Node\\Expression\\ConstantExpression',
  MemberExpression: 'Twig\\Node\\Expression\\GetAttrExpression',
  CallExpression: 'Twig\\Node\\Expression\\FunctionExpression',
};
const PRECEDENCE_BY_OTHER_INFIX_OPERATOR: Readonly<Record<string, number>> = {
  '?': TERNARY_PRECEDENCE,
  'is': TEST_PRECEDENCE,
  'is not': TEST_PRECEDENCE,
  '=>': ARROW_PRECEDENCE,
  ...Object.fromEntries([...POSTFIX_OPERATORS].map((operator) => [operator, POSTFIX_PRECEDENCE])),
};

function twigClassOf(node: EstreeNode): string {
  return TWIG_CLASS_BY_NODE_TYPE[node.type] ?? 'Twig\\Node\\Expression\\AbstractExpression';
}

export function createIdentifier(stream: TwigTokenStream, token: TwigToken): EstreeNode {
  return createNode(stream, 'Identifier', token.start, token.end, { name: token.value });
}

function createNumberLiteral(stream: TwigTokenStream, token: TwigToken): EstreeNode {
  return createNode(stream, 'Literal', token.start, token.end, { value: Number(token.value.replace(/_/g, '')), raw: token.value });
}

function createCall(stream: TwigTokenStream, callee: EstreeNode, parsedArguments: ParsedArguments): EstreeNode {
  return createNode(stream, 'CallExpression', outerStartOf(stream, callee), parsedArguments.end, { callee, arguments: parsedArguments.args, optional: false });
}

function createMember(stream: TwigTokenStream, object: EstreeNode, property: EstreeNode, end: number, options: { readonly isComputed: boolean; readonly isOptional: boolean }): EstreeNode {
  return createNode(stream, 'MemberExpression', outerStartOf(stream, object), end, { object, property, computed: options.isComputed, optional: options.isOptional });
}

function findInfixOperator(stream: TwigTokenStream): { readonly operator: string; readonly precedence: number } | undefined {
  const view = viewCurrentToken(stream);
  if (view.type !== 'operator') {
    return undefined;
  }
  const precedence = BINARY_OPERATORS[view.value]?.precedence ?? PRECEDENCE_BY_OTHER_INFIX_OPERATOR[view.value];
  return precedence === undefined ? undefined : { operator: view.value, precedence };
}

function wrapInChain(stream: TwigTokenStream, expression: EstreeNode): EstreeNode {
  return createNode(stream, 'ChainExpression', expression.start, expression.end, { expression });
}

/**
 * Reads an expression as Twig's Parser::parseExpression() does: a prefix or literal, then every infix operator that binds at least as tightly as the precedence given.
 *
 * @param stream - The block being read.
 * @param minimumPrecedence - The lowest precedence an infix operator needs to be taken into this expression.
 * @returns The expression's ESTree node.
 */
export function parseExpression(stream: TwigTokenStream, minimumPrecedence = 0): EstreeNode {
  let expression = parsePrefix(stream);
  let isOptionalChain = false;

  for (let infix = findInfixOperator(stream); infix && infix.precedence >= minimumPrecedence; infix = findInfixOperator(stream)) {
    if (isOptionalChain && !POSTFIX_OPERATORS.has(infix.operator)) {
      expression = wrapInChain(stream, expression);
      isOptionalChain = false;
    }
    advance(stream);
    isOptionalChain ||= infix.operator === '?.';
    expression = parseInfix(stream, expression, infix.operator);
  }

  if (expression.type === ARROW_PARAMETERS) {
    throw new TwigGrammarError(ARROW_ARGUMENT_MESSAGE);
  }
  return isOptionalChain ? wrapInChain(stream, expression) : expression;
}

function parseInfix(stream: TwigTokenStream, left: EstreeNode, operator: string): EstreeNode {
  switch (operator) {
    case '?':
      return parseTernary(stream, left);
    case 'is':
    case 'is not':
      return parseTest(stream, left, operator === 'is' ? '==' : '!=');
    case '.':
    case '?.':
      return parseAttribute(stream, left, operator === '?.');
    case '|':
      return parseFilter(stream, left);
    case '(':
      return parseFunctionCall(stream, left);
    case '[':
      return parseSubscript(stream, left);
    case '=>':
      return parseArrowFunction(stream, left);
    default:
      return parseBinary(stream, left, BINARY_OPERATORS[operator] as BinaryOperator);
  }
}

function checkAssignmentTarget(target: EstreeNode): void {
  const isVariable = target.type === 'Identifier';
  const isList = target.type === 'ArrayExpression' || target.type === 'ObjectExpression';
  if (!isVariable && !isList) {
    throw new TwigGrammarError(`Cannot assign to "${twigClassOf(target)}", only variables can be assigned.`);
  }
  const entries = (target['elements'] ?? target['properties'] ?? []) as (EstreeNode | null)[];
  if (isList && entries.every((entry) => entry === null)) {
    throw new TwigGrammarError('Cannot destructure to an empty list of variables.');
  }
}

function toPattern(target: EstreeNode): EstreeNode {
  if (target.type === 'ArrayExpression') {
    const elements = (target['elements'] as (EstreeNode | null)[]).map((element) => element && toPattern(element));
    return { ...target, type: 'ArrayPattern', elements };
  }
  if (target.type === 'ObjectExpression') {
    const properties = (target['properties'] as EstreeNode[]).map((property) => (property.type === 'Property' ? { ...property, value: toPattern(property['value'] as EstreeNode) } : property));
    return { ...target, type: 'ObjectPattern', properties };
  }
  return target;
}

function parseBinary(stream: TwigTokenStream, left: EstreeNode, operator: BinaryOperator): EstreeNode {
  if (operator.nodeType === 'AssignmentExpression') {
    checkAssignmentTarget(left);
  }
  const rightPrecedence = operator.associativity === 'left' ? operator.precedence + 1 : operator.precedence;
  const right = parseExpression(stream, rightPrecedence);
  const start = outerStartOf(stream, left);
  const end = outerEndOf(stream, right);

  switch (operator.nodeType) {
    case 'SequenceExpression':
      return createNode(stream, 'SequenceExpression', start, end, { expressions: [left, right] });
    case 'AssignmentExpression':
      return createNode(stream, 'AssignmentExpression', start, end, { operator: '=', left: toPattern(left), right });
    default:
      return createNode(stream, operator.nodeType, start, end, { operator: operator.estreeOperator, left, right });
  }
}

function parseTernary(stream: TwigTokenStream, test: EstreeNode): EstreeNode {
  const consequent = parseExpression(stream, TERNARY_PRECEDENCE);
  const start = outerStartOf(stream, test);
  if (!nextIf(stream, 'punctuation', ':')) {
    return createNode(stream, 'LogicalExpression', start, outerEndOf(stream, consequent), { operator: '&&', left: test, right: consequent });
  }
  const alternate = parseExpression(stream, TERNARY_PRECEDENCE);
  return createNode(stream, 'ConditionalExpression', start, outerEndOf(stream, alternate), { test, consequent, alternate });
}

function parseTestArguments(stream: TwigTokenStream, testName: string): ParsedArguments | undefined {
  if (isAt(stream, 'operator', '(')) {
    return parseArguments(stream, true);
  }
  if (!TESTS_WITH_ONE_MANDATORY_ARGUMENT.has(testName)) {
    return undefined;
  }
  const argument = parseExpression(stream, TEST_PRECEDENCE);
  return { args: [argument], end: outerEndOf(stream, argument) };
}

function parseTest(stream: TwigTokenStream, subject: EstreeNode, estreeOperator: string): EstreeNode {
  const firstWord = expect(stream, 'name');
  const secondWord = nextIf(stream, 'name');
  const testName = secondWord ? `${firstWord.value} ${secondWord.value}` : firstWord.value;
  const callee = createIdentifier(stream, firstWord);
  const testArguments = parseTestArguments(stream, testName);
  const test = testArguments ? createCall(stream, callee, testArguments) : callee;
  const end = testArguments?.end ?? (secondWord ?? firstWord).end;
  return createNode(stream, 'BinaryExpression', outerStartOf(stream, subject), end, { operator: estreeOperator, left: subject, right: test });
}

function parseAttributeName(stream: TwigTokenStream): { readonly property: EstreeNode; readonly isComputed: boolean } {
  const view = viewCurrentToken(stream);
  const isNameOrNumber = view.type === 'name' || view.type === 'number';
  const isOperatorSpelledLikeAName = view.type === 'operator' && startsWithName(view.value);
  if (!isNameOrNumber && !isOperatorSpelledLikeAName) {
    throw new TwigGrammarError(`Expected name or number, got value "${view.value}" of type "${view.type}".`);
  }
  const token = advance(stream);
  return view.type === 'number' ? { property: createNumberLiteral(stream, token), isComputed: true } : { property: createIdentifier(stream, token), isComputed: false };
}

function parseAttribute(stream: TwigTokenStream, object: EstreeNode, isOptional: boolean): EstreeNode {
  let member: EstreeNode;
  if (nextIf(stream, 'operator', '(')) {
    const property = parseExpression(stream);
    const closing = expect(stream, 'punctuation', ')');
    member = createMember(stream, object, property, closing.end, { isComputed: true, isOptional });
  } else {
    const { property, isComputed } = parseAttributeName(stream);
    member = createMember(stream, object, property, property.end, { isComputed, isOptional });
  }
  return isAt(stream, 'operator', '(') ? createCall(stream, member, parseArguments(stream, true)) : member;
}

function parseFilter(stream: TwigTokenStream, subject: EstreeNode): EstreeNode {
  const property = createIdentifier(stream, expect(stream, 'name'));
  const member = createMember(stream, subject, property, property.end, { isComputed: false, isOptional: false });
  return isAt(stream, 'operator', '(') ? createCall(stream, member, parseArguments(stream, true)) : member;
}

function parseFunctionCall(stream: TwigTokenStream, callee: EstreeNode): EstreeNode {
  if (callee.type !== 'Identifier') {
    throw new TwigGrammarError('Function name must be an identifier.');
  }
  return createCall(stream, callee, parseArguments(stream, false));
}

function parseSubscript(stream: TwigTokenStream, object: EstreeNode): EstreeNode {
  const isSliceFromStart = isAt(stream, 'punctuation', ':');
  const from = isSliceFromStart ? undefined : parseExpression(stream);
  const isSlice = nextIf(stream, 'punctuation', ':') !== undefined;
  const length = isSlice && !isAt(stream, 'punctuation', ']') ? parseExpression(stream) : undefined;
  const closing = expect(stream, 'punctuation', ']');
  const parts = [from, length].filter((part) => part !== undefined);
  const [first, second] = parts;
  if (!first) {
    return object;
  }
  const property = second ? createNode(stream, 'SequenceExpression', first.start, second.end, { expressions: parts }) : first;
  return createMember(stream, object, property, closing.end, { isComputed: true, isOptional: false });
}

function parseArrowFunction(stream: TwigTokenStream, parameters: EstreeNode): EstreeNode {
  const isSingleVariable = parameters.type === 'Identifier';
  if (!isSingleVariable && parameters.type !== ARROW_PARAMETERS) {
    throw new TwigGrammarError(ARROW_ARGUMENT_MESSAGE);
  }
  const params = isSingleVariable ? [parameters] : (parameters['params'] as EstreeNode[]);
  const body = parseExpression(stream);
  return createNode(stream, 'ArrowFunctionExpression', outerStartOf(stream, parameters), outerEndOf(stream, body), { id: null, params, body, expression: true, generator: false, async: false });
}

function parsePrefix(stream: TwigTokenStream): EstreeNode {
  const view = viewCurrentToken(stream);
  if (view.type === 'operator' && view.value === '(') {
    return parseGroup(stream);
  }
  const prefix = view.type === 'operator' ? PREFIX_OPERATORS[view.value] : undefined;
  if (!prefix) {
    return parseLiteral(stream);
  }

  const operatorToken = advance(stream);
  const argument = parseExpression(stream, prefix.operandPrecedence);
  const end = outerEndOf(stream, argument);
  if (prefix.nodeType === 'SpreadElement') {
    return createNode(stream, 'SpreadElement', operatorToken.start, end, { argument });
  }
  return createNode(stream, 'UnaryExpression', operatorToken.start, end, { operator: prefix.estreeOperator, prefix: true, argument });
}

function createArrowParameters(stream: TwigTokenStream, params: readonly EstreeNode[], start: number, end: number): EstreeNode {
  if (params.some((param) => param.type !== 'Identifier')) {
    throw new TwigGrammarError('A list must only contain variables.');
  }
  return createNode(stream, ARROW_PARAMETERS, start, end, { params });
}

function parseGroup(stream: TwigTokenStream): EstreeNode {
  const opening = advance(stream);
  const expression = parseExpression(stream);
  const closing = nextIf(stream, 'punctuation', ')');
  if (closing && !isAt(stream, 'operator', '=>')) {
    stream.parenthesisedRanges.set(expression, [opening.start, closing.end]);
    return expression;
  }
  if (closing) {
    return createArrowParameters(stream, [expression], opening.start, closing.end);
  }

  if (!isAt(stream, 'punctuation', ',')) {
    expect(stream, 'punctuation', ')', 'An opened parenthesis is not properly closed');
  }
  const names = [expression];
  let listEnd = nextIf(stream, 'punctuation', ')');
  while (!listEnd) {
    expect(stream, 'punctuation', ',');
    names.push(createIdentifier(stream, expect(stream, 'name')));
    listEnd = nextIf(stream, 'punctuation', ')');
  }
  if (!isAt(stream, 'operator', '=>')) {
    throw new TwigGrammarError('A list of variables must be followed by an arrow.');
  }
  return createArrowParameters(stream, names, opening.start, listEnd.end);
}

function parseName(stream: TwigTokenStream): EstreeNode {
  const token = advance(stream);
  const literalValue = LITERAL_VALUE_BY_NAME[token.value];
  if (literalValue !== undefined) {
    return createNode(stream, 'Literal', token.start, token.end, { value: literalValue, raw: token.value });
  }
  return createIdentifier(stream, token);
}

function parseLiteral(stream: TwigTokenStream): EstreeNode {
  const view = viewCurrentToken(stream);
  if (view.type === 'name') {
    return parseName(stream);
  }
  if (view.type === 'number') {
    return createNumberLiteral(stream, advance(stream));
  }
  if (view.type === 'string' || view.type === 'begin of string interpolation') {
    return parseStringExpression(stream);
  }
  if (view.type === 'punctuation' && view.value === '{') {
    return parseMapping(stream);
  }
  if (view.type === 'operator' && view.value === '[') {
    return parseSequence(stream);
  }
  if (view.type === 'operator' && isWholeName(view.value)) {
    return createIdentifier(stream, advance(stream));
  }
  throw new TwigGrammarError(describeUnexpectedToken(stream));
}

function createStringNode(stream: TwigTokenStream, parts: readonly StringPart[], expressions: readonly EstreeNode[], options: { readonly start: number; readonly end: number; readonly isKey: boolean }): EstreeNode {
  const hasJavaScriptSyntax = parts.some((part) => part.raw.includes('`') || part.raw.includes('${'));
  const isPlainValue = expressions.length === 0 && (options.isKey || hasJavaScriptSyntax);
  if (isPlainValue) {
    const text = parts.map((part) => part.raw).join('');
    return createNode(stream, 'Literal', options.start, options.end, { value: decodeTwigString(text), raw: sourceTextOf(stream, options.start, options.end) });
  }
  const quasis = parts.map((part, partIndex) => createNode(stream, 'TemplateElement', part.start, part.end, {
    value: { raw: part.raw, cooked: decodeTwigString(part.raw) },
    tail: partIndex === parts.length - 1,
  }));
  return createNode(stream, 'TemplateLiteral', options.start, options.end, { quasis, expressions });
}

function sourceTextOf(stream: TwigTokenStream, start: number, end: number): string {
  return stream.block.tokens.filter((token) => token.start >= start && token.end <= end).map((token) => token.value).join('');
}

function parseQuotedString(stream: TwigTokenStream, isKey: boolean): QuotedString {
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
  const node = createStringNode(stream, parts, expressions, { start: opening.start, end: closing.end, isKey });
  return { node, endsWithText };
}

function startsWithText(stream: TwigTokenStream): boolean {
  return tokenAfterCurrent(stream)?.type !== 'INTERPOLATION_START';
}

function parseStringExpression(stream: TwigTokenStream): EstreeNode {
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

function parseSequence(stream: TwigTokenStream): EstreeNode {
  const opening = advance(stream);
  const elements: (EstreeNode | null)[] = [];
  while (!isAt(stream, 'punctuation', ']')) {
    if (elements.length > 0) {
      expect(stream, 'punctuation', ',', 'A sequence element must be followed by a comma');
      if (isAt(stream, 'punctuation', ']')) {
        break;
      }
    }
    elements.push(isAt(stream, 'punctuation', ',') ? null : parseExpression(stream));
  }
  const closing = expect(stream, 'punctuation', ']', 'An opened sequence is not properly closed');
  return createNode(stream, 'ArrayExpression', opening.start, closing.end, { elements });
}

function isInterpolatedStringAt(stream: TwigTokenStream): boolean {
  const closingQuoteIndex = stream.tokens.findIndex((token, index) => index > stream.index && token.type === 'CLOSING_QUOTE');
  return stream.tokens.slice(stream.index + 1, closingQuoteIndex).some((token) => token.type === 'INTERPOLATION_START');
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

function parseMapping(stream: TwigTokenStream): EstreeNode {
  const opening = advance(stream);
  const properties: EstreeNode[] = [];
  while (!isAt(stream, 'punctuation', '}')) {
    if (properties.length > 0) {
      expect(stream, 'punctuation', ',', 'A mapping value must be followed by a comma');
      if (isAt(stream, 'punctuation', '}')) {
        break;
      }
    }
    properties.push(isAt(stream, 'operator', '...') ? parseExpression(stream) : parseProperty(stream));
  }
  const closing = expect(stream, 'punctuation', '}', 'An opened mapping is not properly closed');
  return createNode(stream, 'ObjectExpression', opening.start, closing.end, { properties });
}

function parseArgument(stream: TwigTokenStream): EstreeNode {
  const value = parseExpression(stream);
  const isNamedBySetBinary = value.type === 'AssignmentExpression' && (value['left'] as EstreeNode).type === 'Identifier';
  if (isNamedBySetBinary) {
    return value;
  }
  const separator = nextIf(stream, 'operator', '=') ?? nextIf(stream, 'punctuation', ':');
  if (!separator) {
    return value;
  }
  if (value.type !== 'Identifier') {
    throw new TwigGrammarError(`A parameter name must be a string, "${twigClassOf(value)}" given.`);
  }
  const right = parseExpression(stream);
  return createNode(stream, 'AssignmentExpression', value.start, outerEndOf(stream, right), { operator: '=', left: value, right });
}

/**
 * Reads a call's arguments as Twig's ArgumentsTrait::parseNamedArguments() does, with named arguments as assignments.
 *
 * @param stream - The block being read.
 * @param shouldReadOpening - Whether the opening parenthesis is still to be read.
 * @returns The argument nodes and the offset after the closing parenthesis.
 */
function parseArguments(stream: TwigTokenStream, shouldReadOpening: boolean): ParsedArguments {
  if (shouldReadOpening) {
    expect(stream, 'operator', '(', 'A list of arguments must begin with an opening parenthesis');
  }
  const args: EstreeNode[] = [];
  let hasSpread = false;
  while (!isAt(stream, 'punctuation', ')')) {
    if (args.length > 0) {
      expect(stream, 'punctuation', ',', 'Arguments must be separated by a comma');
      if (isAt(stream, 'punctuation', ')')) {
        break;
      }
    }
    const argument = parseArgument(stream);
    if (argument.type === 'SpreadElement') {
      hasSpread = true;
    } else if (hasSpread) {
      throw new TwigGrammarError('Normal arguments must be placed before argument unpacking.');
    }
    args.push(argument);
  }
  const closing = expect(stream, 'punctuation', ')', 'A list of arguments must be closed by a parenthesis');
  return { args, end: closing.end };
}
