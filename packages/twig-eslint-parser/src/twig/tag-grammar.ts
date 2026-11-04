import { isShortFormTag } from './blocks.js';
import { createIdentifier, parseExpression } from './expression-grammar.js';
import { advance, createNode, createTokenStream, expect, isAt, nextIf, outerEndOf, outerStartOf, startsWithName, TwigGrammarError, viewCurrentToken } from './token-stream.js';
import type { EstreeNode } from '../estree.js';
import type { SourcePosition } from '../source-text.js';
import type { TwigBlock } from './blocks.js';
import type { TwigTokenStream } from './token-stream.js';
import type { TwigToken } from './tokens.js';

export type ParsedTwigBlock =
  | { readonly isParsed: true; readonly statements: EstreeNode[] }
  | { readonly isParsed: false; readonly reason: string };

type TagGrammar = (stream: TwigTokenStream, tagName: TwigToken) => EstreeNode | undefined;

const END_OF_STATEMENT_BLOCK = 'end of statement block';
const NESTED_TOO_DEEPLY_REASON = 'The expression is nested too deeply to read.';

function createStatement(stream: TwigTokenStream, expression: EstreeNode): EstreeNode {
  return createNode(stream, 'ExpressionStatement', outerStartOf(stream, expression), outerEndOf(stream, expression), { expression });
}

function parseExpressionTag(stream: TwigTokenStream): EstreeNode {
  const expression = parseExpression(stream);
  expect(stream, END_OF_STATEMENT_BLOCK);
  return createStatement(stream, expression);
}

function parseWith(stream: TwigTokenStream): EstreeNode | undefined {
  if (nextIf(stream, END_OF_STATEMENT_BLOCK)) {
    return undefined;
  }
  const variables = parseExpression(stream);
  nextIf(stream, 'name', 'only');
  expect(stream, END_OF_STATEMENT_BLOCK);
  return createStatement(stream, variables);
}

function parseAssignmentTargets(stream: TwigTokenStream): EstreeNode[] {
  const targets: EstreeNode[] = [];
  do {
    const view = viewCurrentToken(stream);
    const isOperatorSpelledLikeAName = view.type === 'operator' && startsWithName(view.value);
    const target = isOperatorSpelledLikeAName ? advance(stream) : expect(stream, 'name', undefined, 'Only variables can be assigned to');
    targets.push(createIdentifier(stream, target));
  } while (nextIf(stream, 'punctuation', ','));
  return targets;
}

function parseExpressionList(stream: TwigTokenStream): EstreeNode[] {
  const expressions: EstreeNode[] = [];
  do {
    expressions.push(parseExpression(stream));
  } while (nextIf(stream, 'punctuation', ','));
  return expressions;
}

function combineList(stream: TwigTokenStream, items: readonly EstreeNode[], type: 'ArrayPattern' | 'ArrayExpression'): EstreeNode {
  const [first] = items as [EstreeNode, ...EstreeNode[]];
  if (items.length === 1) {
    return first;
  }
  return createNode(stream, type, outerStartOf(stream, first), outerEndOf(stream, items.at(-1) as EstreeNode), { elements: items });
}

function parseSetValues(stream: TwigTokenStream, targetCount: number): EstreeNode | null {
  if (!nextIf(stream, 'operator', '=')) {
    if (targetCount > 1) {
      throw new TwigGrammarError('When using set with a block, you cannot have a multi-target.');
    }
    expect(stream, END_OF_STATEMENT_BLOCK);
    return null;
  }

  const values = parseExpressionList(stream);
  expect(stream, END_OF_STATEMENT_BLOCK);
  if (values.length !== targetCount) {
    throw new TwigGrammarError('When using set, you must have the same number of variables and assignments.');
  }
  return combineList(stream, values, 'ArrayExpression');
}

function parseSet(stream: TwigTokenStream, tagName: TwigToken): EstreeNode {
  const targets = parseAssignmentTargets(stream);
  const id = combineList(stream, targets, 'ArrayPattern');
  const init = parseSetValues(stream, targets.length);
  const end = init ? outerEndOf(stream, init) : id.end;
  const declarator = createNode(stream, 'VariableDeclarator', id.start, end, { id, init });
  return createNode(stream, 'VariableDeclaration', tagName.start, end, { kind: 'var', declarations: [declarator] });
}

function parseFor(stream: TwigTokenStream): EstreeNode {
  parseAssignmentTargets(stream);
  expect(stream, 'operator', 'in');
  return parseExpressionTag(stream);
}

function isConstantProperty(property: EstreeNode): boolean {
  if (property.type !== 'Property') {
    return false;
  }
  const isConstantKey = !property['computed'] || isConstant(property['key'] as EstreeNode);
  return isConstantKey && isConstant(property['value'] as EstreeNode);
}

function isConstant(node: EstreeNode | null): boolean {
  switch (node?.type) {
    case 'Literal':
      return true;
    case 'TemplateLiteral':
      return (node['expressions'] as EstreeNode[]).length === 0;
    case 'UnaryExpression':
      return node['operator'] !== '!' && isConstant(node['argument'] as EstreeNode);
    case 'ArrayExpression':
      return (node['elements'] as (EstreeNode | null)[]).every(isConstant);
    case 'ObjectExpression':
      return (node['properties'] as EstreeNode[]).every(isConstantProperty);
    default:
      return false;
  }
}

function parseMacroParameter(stream: TwigTokenStream): EstreeNode {
  const name = createIdentifier(stream, expect(stream, 'name', undefined, 'An argument must be a name'));
  if (!nextIf(stream, 'operator', '=')) {
    return name;
  }
  const defaultValue = parseExpression(stream);
  if (!isConstant(defaultValue)) {
    throw new TwigGrammarError('A default value for an argument must be a constant (a boolean, a string, a number, a sequence, or a mapping).');
  }
  return createNode(stream, 'AssignmentExpression', name.start, outerEndOf(stream, defaultValue), { operator: '=', left: name, right: defaultValue });
}

function parseVariadicParameter(stream: TwigTokenStream, spread: TwigToken, macroName: string): EstreeNode {
  const name = expect(stream, 'name', undefined, 'A variadic argument must be a name');
  if (isAt(stream, 'operator', '=')) {
    throw new TwigGrammarError(`The variadic argument "${name.value}" in macro "${macroName}" cannot have a default value.`);
  }
  if (nextIf(stream, 'punctuation', ',') && !isAt(stream, 'punctuation', ')')) {
    throw new TwigGrammarError(`The variadic argument "${name.value}" in macro "${macroName}" must be the last one.`);
  }
  return createNode(stream, 'SpreadElement', spread.start, name.end, { argument: createIdentifier(stream, name) });
}

function parseMacro(stream: TwigTokenStream): EstreeNode {
  const name = expect(stream, 'name');
  expect(stream, 'operator', '(', 'A list of arguments must begin with an opening parenthesis');
  const parameters: EstreeNode[] = [];
  while (!isAt(stream, 'punctuation', ')')) {
    if (parameters.length > 0) {
      expect(stream, 'punctuation', ',', 'Arguments must be separated by a comma');
      if (isAt(stream, 'punctuation', ')')) {
        break;
      }
    }
    const spread = nextIf(stream, 'operator', '...');
    if (spread) {
      parameters.push(parseVariadicParameter(stream, spread, name.value));
      break;
    }
    parameters.push(parseMacroParameter(stream));
  }
  const closing = expect(stream, 'punctuation', ')', 'A list of arguments must be closed by a parenthesis');
  expect(stream, END_OF_STATEMENT_BLOCK);
  const callee = createIdentifier(stream, name);
  return createStatement(stream, createNode(stream, 'CallExpression', name.start, closing.end, { callee, arguments: parameters, optional: false }));
}

function parseShortFormBlock(stream: TwigTokenStream): EstreeNode {
  expect(stream, 'name');
  return parseExpressionTag(stream);
}

function parseInclude(stream: TwigTokenStream, tagName: TwigToken): EstreeNode {
  const template = parseExpression(stream);
  if (nextIf(stream, 'name', 'ignore')) {
    expect(stream, 'name', 'missing');
  }
  const variables = nextIf(stream, 'name', 'with') ? parseExpression(stream) : undefined;
  nextIf(stream, 'name', 'only');
  expect(stream, END_OF_STATEMENT_BLOCK);
  const args = variables ? [template, variables] : [template];
  const call = createNode(stream, 'CallExpression', tagName.start, outerEndOf(stream, args.at(-1) as EstreeNode), { callee: createIdentifier(stream, tagName), arguments: args, optional: false });
  return createStatement(stream, call);
}

const TAG_GRAMMARS: ReadonlyMap<string, TagGrammar> = new Map(Object.entries({
  if: parseExpressionTag,
  elseif: parseExpressionTag,
  do: parseExpressionTag,
  with: parseWith,
  set: parseSet,
  for: parseFor,
  macro: parseMacro,
  block: parseShortFormBlock,
  include: parseInclude,
  embed: parseInclude,
}));

export const CONVERTED_TAGS: ReadonlySet<string> = new Set(TAG_GRAMMARS.keys());

export function isConvertedTwigBlock(block: TwigBlock): boolean {
  if (block.kind === 'print') {
    return true;
  }
  if (block.kind !== 'tag' || block.tagName === undefined || !TAG_GRAMMARS.has(block.tagName)) {
    return false;
  }
  return block.tagName !== 'block' || isShortFormTag(block);
}

function parseBlockStatement(stream: TwigTokenStream): EstreeNode | undefined {
  if (stream.block.kind === 'print') {
    const expression = parseExpression(stream);
    expect(stream, 'end of print statement');
    return createStatement(stream, expression);
  }
  const tagName = advance(stream);
  return TAG_GRAMMARS.get(tagName.value)?.(stream, tagName);
}

function isCallStackOverflow(error: unknown): boolean {
  return error instanceof RangeError && /call stack/i.test(error.message);
}

/**
 * Reads one Twig block with Twig's grammar and builds its ESTree statement.
 *
 * @param block - The block to read.
 * @param locate - Turns a source offset into a line and column.
 * @returns The statement, the reason Twig would reject the block, or `undefined` when the block is not converted.
 */
export function parseTwigBlock(block: TwigBlock, locate: (offset: number) => SourcePosition): ParsedTwigBlock | undefined {
  if (!isConvertedTwigBlock(block)) {
    return undefined;
  }

  try {
    const statement = parseBlockStatement(createTokenStream(block, locate));
    return statement ? { isParsed: true, statements: [statement] } : undefined;
  } catch (error) {
    if (error instanceof TwigGrammarError) {
      return { isParsed: false, reason: error.message };
    }
    if (isCallStackOverflow(error)) {
      return { isParsed: false, reason: NESTED_TOO_DEEPLY_REASON };
    }
    throw error;
  }
}
