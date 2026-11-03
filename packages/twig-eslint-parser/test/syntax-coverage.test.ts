import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseForESLint } from '../src/index.js';
import { CONVERTED_TAGS, TAGS_LEFT_UNCONVERTED, TWO_WORD_TESTS } from '../src/twig/syntax.js';
import { TWIG_OPERATORS } from '../src/twig/operators.js';
import { tokenizeTwig } from '../src/twig/tokens.js';
import { checkParserOutput } from './support/output-checks.js';

type Inventory = {
  readonly twig: string;
  readonly tags: readonly { readonly name: string; readonly extension: string }[];
  readonly lexerTags: readonly string[];
  readonly tests: readonly string[];
  readonly expressions: readonly { readonly type: 'prefix' | 'infix'; readonly parser: string; readonly name: string; readonly aliases: readonly string[] }[];
  readonly tokenTypes: readonly string[];
  readonly punctuation: readonly string[];
};
type GoldenToken = { readonly type: string; readonly value: string | number; readonly offset: number };
type Fixture = { readonly name: string; readonly code: string; readonly twig: string; readonly tokens: readonly GoldenToken[] };

const fixturesDirectory = new URL('./fixtures/twig/', import.meta.url);
const inventory = JSON.parse(readFileSync(new URL('twig-syntax.json', fixturesDirectory), 'utf8')) as Inventory;
const fixtures: Fixture[] = readdirSync(fixturesDirectory)
  .filter((name) => name.endsWith('.twig'))
  .map((name) => {
    const golden = JSON.parse(readFileSync(new URL(name.replace(/\.twig$/, '.tokens.json'), fixturesDirectory), 'utf8')) as { twig: string; tokens?: GoldenToken[] };
    return { name, code: readFileSync(new URL(name, fixturesDirectory), 'utf8'), twig: golden.twig, tokens: golden.tokens ?? [] };
  });

const STATEMENT_STARTS = new Set(['begin of print statement', 'begin of statement block', 'begin of string interpolation']);
const OPENERS = new Set(['(', '[', '{']);
const PREFIX_CONTEXTS = new Set(['(', '[', '{', ',', ':', '?', '=>', '=']);

const syntaxForms: Record<string, (fixture: Fixture, significant: readonly GoldenToken[]) => boolean> = {
  'single-quoted string': ({ code }, tokens) => tokens.some((token) => token.type === 'string' && code[token.offset] === "'"),
  'double-quoted string': ({ code }, tokens) => tokens.some((token) => token.type === 'string' && code[token.offset] === '"'),
  'integer': ({ code }, tokens) => numberSources(code, tokens).some((source) => /^\d+$/.test(source)),
  'decimal number': ({ code }, tokens) => numberSources(code, tokens).some((source) => source.includes('.')),
  'number with exponent': ({ code }, tokens) => numberSources(code, tokens).some((source) => /e/i.test(source)),
  'number with digit separators': ({ code }, tokens) => numberSources(code, tokens).some((source) => source.includes('_')),
  'true, false and null': (_, tokens) => ['true', 'false', 'null'].every((word) => tokens.some((token) => token.type === 'name' && String(token.value).toLowerCase() === word)),
  'array literal': (_, tokens) => tokens.some((token, index) => token.value === '[' && isPrefixPosition(tokens, index)),
  'hash with name keys': (_, tokens) => hashKeyFollows(tokens, (token) => token.type === 'name'),
  'hash with string keys': (_, tokens) => hashKeyFollows(tokens, (token) => token.type === 'string'),
  'hash with number keys': (_, tokens) => hashKeyFollows(tokens, (token) => token.type === 'number'),
  'hash with computed keys': (_, tokens) => tokens.some((token, index) => token.value === '(' && ['{', ','].includes(String(tokens[index - 1]?.value)) && insideHash(tokens, index)),
  'named argument': (_, tokens) => tokens.some((token, index) => token.type === 'name' && ['(', ','].includes(String(tokens[index - 1]?.value)) && [':', '='].includes(String(tokens[index + 1]?.value)) && innermostOpener(tokens, index) === '('),
  'filter without arguments': (_, tokens) => tokens.some((token, index) => token.value === '|' && tokens[index + 1]?.type === 'name' && tokens[index + 2]?.value !== '('),
  'filter with arguments': (_, tokens) => tokens.some((token, index) => token.value === '|' && tokens[index + 1]?.type === 'name' && tokens[index + 2]?.value === '('),
  'method call': (_, tokens) => tokens.some((token, index) => token.value === '.' && tokens[index + 1]?.type === 'name' && tokens[index + 2]?.value === '('),
  'whitespace control with -': ({ code }) => /\{[{%#]-|-[}%#]\}/.test(code),
  'whitespace control with ~': ({ code }) => /\{[{%#]~|~[}%#]\}/.test(code),
  'comment': ({ code }) => tokenizeTwig(code).some((token) => token.type === 'COMMENT_START'),
  'inline comment': ({ code }) => tokenizeTwig(code).some((token) => token.type === 'INLINE_COMMENT'),
  'markup: Drupal attributes printed after a tag name': ({ code }) => /<[A-Za-z][\w:-]*\{\{[-~]?\s*[\w.]*attributes\b/.test(code),
  'markup: create_attribute() printed after a tag name': ({ code }) => /<[A-Za-z][\w:-]*\{\{[-~]?\s*create_attribute\(/.test(code),
  'markup: Twig tag written after a tag name': ({ code }) => /<[A-Za-z][\w:-]*\{%/.test(code),
  'markup: tag name ending in Twig': ({ code }) => /<[A-Za-z][\w:-]*\{\{(?![-~]?\s*(?:[\w.]*attributes\b|create_attribute\())/.test(code),
  'markup: tag name that is only Twig': ({ code }) => /<\{\{/.test(code),
  'markup: Twig inside an attribute value': ({ code }) => /=\s*"[^"]*\{\{/.test(code),
  'markup: Twig inside a class attribute': ({ code }) => /\sclass="[^"]*\{\{/.test(code),
  'markup: Twig delimiters inside a Twig string': ({ code }) => tokenizeTwig(code).some((token) => token.type === 'STRING' && /\{\{|\{%|\{#|\}\}|%\}|#\}/.test(token.value)),
  'markup: Twig delimiters inside verbatim': ({ code }) => /\{%[-~]?\s*verbatim\s*[-~]?%\}(?:(?!endverbatim)[\s\S])*\{[{%#]/.test(code),
};

function numberSources(code: string, tokens: readonly GoldenToken[]): string[] {
  return tokens.filter((token) => token.type === 'number').map((token) => /^[\d_]+(?:\.[\d_]+)?(?:[eE][+-]?\d+)?/.exec(code.slice(token.offset))?.[0] ?? '');
}

function innermostOpener(tokens: readonly GoldenToken[], index: number): string | undefined {
  const stack: string[] = [];
  for (const token of tokens.slice(0, index)) {
    if (STATEMENT_STARTS.has(token.type)) {
      stack.length = 0;
    }
    if (OPENERS.has(String(token.value))) {
      stack.push(String(token.value));
    }
    if ([')', ']', '}'].includes(String(token.value))) {
      stack.pop();
    }
  }
  return stack.at(-1);
}

function insideHash(tokens: readonly GoldenToken[], index: number): boolean {
  return innermostOpener(tokens, index) === '{';
}

function hashKeyFollows(tokens: readonly GoldenToken[], isKey: (token: GoldenToken) => boolean): boolean {
  return tokens.some((token, index) => isKey(token) && ['{', ','].includes(String(tokens[index - 1]?.value)) && tokens[index + 1]?.value === ':' && insideHash(tokens, index));
}

function isPrefixPosition(tokens: readonly GoldenToken[], index: number): boolean {
  const previous = tokens[index - 1];
  return !previous || STATEMENT_STARTS.has(previous.type) || (previous.type === 'operator' && !['(', '[', '.', '|', '?.'].includes(String(previous.value))) || PREFIX_CONTEXTS.has(String(previous.value));
}

function significantTokens(fixture: Fixture): GoldenToken[] {
  return fixture.tokens.filter((token) => token.type !== 'text');
}

function featuresUsedIn(fixture: Fixture): Set<string> {
  const features = new Set<string>();
  const tokens = significantTokens(fixture);
  for (const token of fixture.tokens) {
    features.add(`token: ${token.type}`);
  }
  tokens.forEach((token, index) => {
    const value = String(token.value).replace(/\s+/g, ' ');
    const previous = tokens[index - 1];
    if (previous?.type === 'begin of statement block' && token.type === 'name') {
      features.add(`tag: ${value}`);
    }
    if (token.type === 'punctuation' || (token.type === 'operator' && inventory.punctuation.includes(value))) {
      features.add(`punctuation: ${value}`);
    }
    if (token.type === 'operator') {
      features.add(`${isPrefixPosition(tokens, index) ? 'prefix' : 'infix'}: ${value}`);
    }
    if (token.type === 'string' || token.type === 'number') {
      features.add('prefix: literal');
    }
    if (token.type === 'operator' && (value === 'is' || value === 'is not')) {
      const first = tokens[index + 1];
      const second = tokens[index + 2];
      const twoWords = `${String(first?.value)} ${String(second?.value)}`;
      if (first?.type === 'name') {
        features.add(`test: ${second?.type === 'name' && inventory.tests.includes(twoWords) ? twoWords : String(first.value)}`);
      }
    }
  });
  for (const tag of inventory.lexerTags) {
    if (new RegExp(`\\{%[-~]?\\s*${tag}\\b`).test(fixture.code)) {
      features.add(`tag: ${tag}`);
    }
  }
  for (const [form, isUsed] of Object.entries(syntaxForms)) {
    if (isUsed(fixture, tokens)) {
      features.add(`form: ${form}`);
    }
  }
  return features;
}

function expectedFeatures(): string[] {
  return [
    ...inventory.tags.map((tag) => `tag: ${tag.name}`),
    ...inventory.lexerTags.map((tag) => `tag: ${tag}`),
    ...inventory.tests.map((test) => `test: ${test}`),
    ...inventory.expressions.flatMap((expression) => [expression.name, ...expression.aliases].map((name) => `${expression.type}: ${name}`)),
    ...inventory.tokenTypes.map((type) => `token: ${type}`),
    ...inventory.punctuation.map((character) => `punctuation: ${character}`),
    ...Object.keys(syntaxForms).map((form) => `form: ${form}`),
  ];
}

describe(`Twig ${inventory.twig} syntax coverage`, () => {
  it('uses the same Twig version for the syntax inventory and every golden token file', () => {
    expect(fixtures.filter((fixture) => fixture.twig !== inventory.twig).map((fixture) => `${fixture.name}: ${fixture.twig}`)).toEqual([]);
  });

  it('has fixtures that together use every tag, test, operator, token type, punctuation character and syntax form', () => {
    const used = new Set(fixtures.flatMap((fixture) => [...featuresUsedIn(fixture)]));
    const missing = expectedFeatures().filter((feature) => !used.has(feature));
    expect(missing, 'Add these to a fixture in test/fixtures/twig, then run npm run golden:twig').toEqual([]);
  });

  it('knows whether to convert or skip every Twig tag', () => {
    const unclassified = inventory.tags.map((tag) => tag.name).filter((tag) => !CONVERTED_TAGS.has(tag) && !TAGS_LEFT_UNCONVERTED.has(tag));
    expect(unclassified, 'Add these to CONVERTED_TAGS or TAGS_LEFT_UNCONVERTED in src/twig/syntax.ts').toEqual([]);
  });

  it('knows the second word of every two-word test', () => {
    const twoWordTestNames = inventory.tests.filter((test) => test.includes(' '));
    expect(Object.entries(TWO_WORD_TESTS).map(([first, second]) => `${first} ${second}`).sort(), 'Update TWO_WORD_TESTS in src/twig/syntax.ts').toEqual(twoWordTestNames.sort());
  });

  it('lexes every operator Twig lexes as one', () => {
    const lexedOtherwise = new Set(['=>', '...', 'is', 'is not', '(', '[', '.', '|', '?', 'literal']);
    const twigOperators = inventory.expressions
      .flatMap((expression) => [expression.name, ...expression.aliases])
      .filter((operator) => !lexedOtherwise.has(operator));
    expect([...TWIG_OPERATORS].sort(), 'Update TWIG_OPERATORS in src/twig/operators.ts').toEqual([...new Set(twigOperators)].sort());
  });

  const binaryOperators = inventory.expressions
    .filter((expression) => expression.parser === 'BinaryOperatorExpressionParser')
    .flatMap((expression) => [expression.name, ...expression.aliases]);
  it.each(binaryOperators)('converts the binary operator %s', (operator) => {
    const code = /^has (some|every)$/.test(operator) ? `{{ a ${operator} x => x }}` : `{{ a ${operator} b }}`;
    expect(checkParserOutput(code), 'Map the operator in JAVASCRIPT_BY_TWIG_OPERATOR in src/twig/syntax.ts').toEqual([]);
    expect(parseForESLint(code).ast.twigBody).toHaveLength(1);
  });

  const unaryOperators = inventory.expressions.filter((expression) => expression.parser === 'UnaryOperatorExpressionParser').map((expression) => expression.name);
  it.each(unaryOperators)('converts the unary operator %s', (operator) => {
    const code = operator === '...' ? '{{ [...a] }}' : `{{ ${operator} a }}`;
    expect(checkParserOutput(code), 'Map the operator in JAVASCRIPT_BY_TWIG_OPERATOR in src/twig/syntax.ts').toEqual([]);
  });

  it.each(inventory.tests.flatMap((test) => [`is ${test}`, `is not ${test}`]))('converts the test "a %s"', (test) => {
    expect(checkParserOutput(`{{ a ${test} }}`), 'Update TWO_WORD_TESTS or JAVASCRIPT_BY_TWIG_TEST_OPERATOR in src/twig/syntax.ts').toEqual([]);
  });
});
