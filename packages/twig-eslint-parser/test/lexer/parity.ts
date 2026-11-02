import { Lexer } from '../../src/lexer/Lexer.js';
import type { Token } from '../../src/lexer/Token.js';
import type { TokenType } from '../../src/lexer/TokenType.js';

type GoldenToken = { type: string; value: unknown; line: number; offset: number; end?: number };
export type Golden = { twig: string; tokens: GoldenToken[] };
type PositionedToken = {
  index: number;
  type: TokenType;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
  insideComment: boolean;
};
type Range = { start: number; end: number };
type Comparison = { mismatches: string[]; claimed: PositionedToken[]; text?: Range };
type Template = {
  source: string;
  ours: PositionedToken[];
  ourStarts: number[];
  oursByStart: Map<number, PositionedToken>;
  lineStarts: number[];
  tagsConsumedByTwigLexer: PositionedToken[][];
  columnsResetByLineTag: Range[];
  verbatimBodies: Map<number, number>;
  toUtf16: Map<number, number>;
};

const ourTypeByTwigType: Record<string, TokenType> = {
  'begin of print statement': 'VARIABLE_START',
  'end of print statement': 'VARIABLE_END',
  'begin of statement block': 'TAG_START',
  'end of statement block': 'TAG_END',
  'begin of string interpolation': 'INTERPOLATION_START',
  'end of string interpolation': 'INTERPOLATION_END',
  'end of template': 'EOF',
  'name': 'NAME',
  'number': 'NUMBER',
  'punctuation': 'PUNCTUATION',
  'operator': 'OPERATOR',
};

const ourTypeByTwigOperator: Record<string, TokenType> = {
  '(': 'PUNCTUATION',
  '[': 'PUNCTUATION',
  '.': 'PUNCTUATION',
  '|': 'PUNCTUATION',
  '?': 'PUNCTUATION',
  '=>': 'ARROW',
  '...': 'SPREAD_OPERATOR',
  'is': 'TEST_OPERATOR',
  'is not': 'TEST_OPERATOR',
};

const BEGIN_DELIMITER_TWIG_TYPES = new Set(['begin of print statement', 'begin of statement block']);
const END_DELIMITER_TWIG_TYPES = new Set(['end of print statement', 'end of statement block']);
const MODIFIER_TYPES = new Set<TokenType>(['TRIMMING_MODIFIER', 'LINE_TRIMMING_MODIFIER']);
const TYPES_TWIG_SKIPS = new Set<TokenType>(['WHITESPACE', 'INLINE_COMMENT']);
const TAG_NAMES_CONSUMED_BY_TWIG_LEXER = new Set(['verbatim', 'endverbatim', 'line']);
const escapedCharacterByLetter: Record<string, string> = { f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
const PCRE_WHITESPACE = /[ \t\n\v\f\r]+/g;
const WHITESPACE_TWIG_TRIMS = /^[ \t\n\v\f\r\0]+$/;
const LINE_BREAK = /\r\n|\r|\n/g;

function utf16IndexByByteOffset(source: string): Map<number, number> {
  const indexByByteOffset = new Map<number, number>();
  let byteOffset = 0;
  let utf16Index = 0;
  for (const character of source) {
    indexByByteOffset.set(byteOffset, utf16Index);
    byteOffset += Buffer.byteLength(character);
    utf16Index += character.length;
  }
  indexByByteOffset.set(byteOffset, utf16Index);
  return indexByByteOffset;
}

function toUtf16Index(template: Template, byteOffset: number): number {
  const index = template.toUtf16.get(byteOffset);
  if (index === undefined) {
    throw new Error(`Golden offset ${byteOffset} is not a character boundary.`);
  }
  return index;
}

function positionTokens(tokens: Token[]): PositionedToken[] {
  let start = 0;
  let insideComment = false;
  return tokens.map((token, index) => {
    const value = token.value === null || token.value === undefined ? '' : String(token.value);
    if (token.type === 'COMMENT_START') {
      insideComment = true;
    }
    const positioned = { index, type: token.type, value, start, end: start + value.length, line: token.line, column: token.column, insideComment };
    if (token.type === 'COMMENT_END') {
      insideComment = false;
    }
    start = positioned.end;
    return positioned;
  });
}

function findLineStarts(source: string): number[] {
  return [0, ...[...source.matchAll(LINE_BREAK)].map((match) => match.index + match[0].length)];
}

function lastIndexAtOrBefore(sortedValues: readonly number[], target: number): number {
  let low = 0;
  let high = sortedValues.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((sortedValues[middle] ?? 0) <= target) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function physicalColumnOf(template: Template, offset: number): number {
  const lineStart = template.lineStarts[lastIndexAtOrBefore(template.lineStarts, offset)] ?? 0;
  return offset - lineStart + 1;
}

function tokenContaining(template: Template, offset: number): PositionedToken | undefined {
  return template.ours[lastIndexAtOrBefore(template.ourStarts, offset)];
}

function tokensOverlapping(template: Template, first: PositionedToken, end: number): PositionedToken[] {
  const tokens = [first];
  for (let index = first.index + 1; (template.ours[index]?.start ?? end) < end; index += 1) {
    const token = template.ours[index];
    if (token) {
      tokens.push(token);
    }
  }
  return tokens;
}

function tagTokensFrom(ours: PositionedToken[], tagStart: PositionedToken): PositionedToken[] {
  let index = tagStart.index;
  while (index < ours.length - 1 && ours[index]?.type !== 'TAG_END') {
    index += 1;
  }
  return ours.slice(tagStart.index, index + 1);
}

function findTagsConsumedByTwigLexer(ours: PositionedToken[]): PositionedToken[][] {
  return ours
    .filter((token) => token.type === 'TAG_START')
    .map((tagStart) => tagTokensFrom(ours, tagStart))
    .filter((tagTokens) => TAG_NAMES_CONSUMED_BY_TWIG_LEXER.has(tagTokens.find((token) => token.type === 'NAME')?.value ?? ''));
}

function findColumnsResetByLineTag(tags: PositionedToken[][], lineStarts: number[], sourceLength: number): Range[] {
  return tags
    .filter((tagTokens) => tagTokens.some((token) => token.type === 'NAME' && token.value === 'line'))
    .map((tagTokens) => {
      const tagEnd = tagTokens.at(-1)?.end ?? 0;
      const nextLineStart = lineStarts.find((lineStart) => lineStart > tagEnd) ?? sourceLength + 1;
      return { start: tagEnd, end: nextLineStart };
    });
}

function normaliseNewlines(text: string): string {
  return text.replace(LINE_BREAK, '\n');
}

function readEscapeSequence(text: string, position: number): { bytes: Buffer; next: number } {
  if (position >= text.length) {
    return { bytes: Buffer.from('\\'), next: position };
  }

  const character = String.fromCodePoint(text.codePointAt(position) ?? 0);

  const escapedCharacter = escapedCharacterByLetter[character];
  if (escapedCharacter) {
    return { bytes: Buffer.from(escapedCharacter), next: position + 1 };
  }

  const hexadecimal = /^x([0-9a-fA-F]{1,2})/.exec(text.slice(position, position + 3));
  if (hexadecimal?.[1]) {
    return { bytes: Buffer.from([parseInt(hexadecimal[1], 16)]), next: position + hexadecimal[0].length };
  }

  const octal = /^[0-7]{1,3}/.exec(text.slice(position, position + 3));
  if (octal) {
    return { bytes: Buffer.from([parseInt(octal[0], 8) % 256]), next: position + octal[0].length };
  }

  return { bytes: Buffer.from(character), next: position + character.length };
}

// Reproduces Twig\Lexer::stripcslashes(), which turns a string literal's source into the value Twig stores.
function decodeTwigStringContent(content: string): string {
  const text = normaliseNewlines(content);
  const chunks: Buffer[] = [];
  let position = 0;
  while (position < text.length) {
    const backslash = text.indexOf('\\', position);
    if (backslash === -1) {
      chunks.push(Buffer.from(text.slice(position)));
      break;
    }
    chunks.push(Buffer.from(text.slice(position, backslash)));
    const escape = readEscapeSequence(text, backslash + 1);
    chunks.push(escape.bytes);
    position = escape.next;
  }
  return Buffer.concat(chunks).toString('utf8');
}

function endOfNormalisedText(source: string, start: number, normalised: string): number | undefined {
  let sourceIndex = start;
  for (const character of normalised) {
    if (character === '\n' && source.startsWith('\r\n', sourceIndex)) {
      sourceIndex += 2;
    } else if (character === '\n' && source[sourceIndex] === '\r') {
      sourceIndex += 1;
    } else if (source.startsWith(character, sourceIndex)) {
      sourceIndex += character.length;
    } else {
      return undefined;
    }
  }
  return sourceIndex;
}

function expectedTypeOf(twigToken: GoldenToken): TokenType {
  if (twigToken.type === 'operator') {
    return ourTypeByTwigOperator[String(twigToken.value)] ?? 'OPERATOR';
  }

  const expectedType = ourTypeByTwigType[twigToken.type];
  if (!expectedType) {
    throw new Error(`No type mapping for Twig token type "${twigToken.type}".`);
  }
  return expectedType;
}

function quotedStringSpan(ours: PositionedToken[], openingQuote: PositionedToken): PositionedToken[] {
  const next = ours[openingQuote.index + 1];
  const afterNext = ours[openingQuote.index + 2];
  if (next?.type === 'STRING' && afterNext) {
    return [openingQuote, next, afterNext];
  }
  return next ? [openingQuote, next] : [openingQuote];
}

function spanOf(twigToken: GoldenToken, first: PositionedToken, ours: PositionedToken[]): PositionedToken[] {
  const next = ours[first.index + 1];
  if (BEGIN_DELIMITER_TWIG_TYPES.has(twigToken.type) && next && MODIFIER_TYPES.has(next.type)) {
    return [first, next];
  }
  if (END_DELIMITER_TWIG_TYPES.has(twigToken.type) && next && MODIFIER_TYPES.has(first.type)) {
    return [first, next];
  }
  if (twigToken.type === 'string' && first.type === 'OPENING_QUOTE') {
    return quotedStringSpan(ours, first);
  }
  return [first];
}

function describeSpan(span: PositionedToken[]): string {
  return span.map((token) => `${token.type} ${JSON.stringify(token.value)}`).join(' + ');
}

function stringShapeMismatch(span: PositionedToken[]): string | undefined {
  const [first, middle, last] = span;
  if (span.length === 1 && first?.type === 'STRING') {
    return undefined;
  }

  const closing = span.length === 3 ? last : middle;
  const hasContent = span.length === 2 || middle?.type === 'STRING';
  if (first?.type === 'OPENING_QUOTE' && hasContent && closing?.type === 'CLOSING_QUOTE' && closing.value === first.value) {
    return undefined;
  }
  return `our tokens are ${describeSpan(span)}, not one quoted string`;
}

function typeMismatch(twigToken: GoldenToken, span: PositionedToken[]): string | undefined {
  if (twigToken.type === 'string') {
    return stringShapeMismatch(span);
  }

  const expectedType = expectedTypeOf(twigToken);
  const main = END_DELIMITER_TWIG_TYPES.has(twigToken.type) ? span.at(-1) : span[0];
  return main?.type === expectedType ? undefined : `our token is ${describeSpan(span)}, expected ${expectedType}`;
}

function ourValueAsTwigSees(twigToken: GoldenToken, span: PositionedToken[]): unknown {
  const [first] = span;
  if (!first) {
    return undefined;
  }
  switch (twigToken.type) {
    case 'name':
    case 'punctuation':
      return first.value;
    case 'operator':
      return first.value.replace(PCRE_WHITESPACE, ' ');
    case 'number':
      return Number(first.value.replaceAll('_', ''));
    case 'string':
      return decodeTwigStringContent(span.find((token) => token.type === 'STRING')?.value ?? '');
    default:
      return twigToken.value;
  }
}

function valueMismatch(twigToken: GoldenToken, span: PositionedToken[]): string | undefined {
  const ourValue = ourValueAsTwigSees(twigToken, span);
  return ourValue === twigToken.value ? undefined : `our value is ${JSON.stringify(ourValue)}`;
}

function extentMismatch(twigToken: GoldenToken, span: PositionedToken[], template: Template): string | undefined {
  if (twigToken.end === undefined) {
    return undefined;
  }

  const twigEnd = toUtf16Index(template, twigToken.end);
  const ourEnd = span.at(-1)?.end;
  return ourEnd === twigEnd ? undefined : `our token ends at ${ourEnd}, Twig's at ${twigEnd}`;
}

function positionMismatches(twigToken: GoldenToken, first: PositionedToken, template: Template): string[] {
  const mismatches: string[] = [];
  if (first.line !== twigToken.line) {
    mismatches.push(`our line is ${first.line}`);
  }

  const columnIsReset = template.columnsResetByLineTag.some((range) => range.start <= first.start && first.start < range.end);
  const physicalColumn = physicalColumnOf(template, first.start);
  if (!columnIsReset && first.column !== physicalColumn) {
    mismatches.push(`our column is ${first.column}, the source's is ${physicalColumn}`);
  }
  return mismatches;
}

function describeMismatch(twigToken: GoldenToken, reason: string): string {
  return `${reason}: Twig ${twigToken.type} ${JSON.stringify(twigToken.value)} at line ${twigToken.line}, offset ${twigToken.offset}`;
}

function lineOfOffset(token: PositionedToken, offset: number, source: string): number {
  return token.line + (source.slice(token.start, offset).match(LINE_BREAK)?.length ?? 0);
}

function endOfTwigsEndverbatimMatch(source: string, tagTokens: PositionedToken[]): number {
  const tagEnd = tagTokens.at(-1)?.end ?? 0;
  const modifier = tagTokens.at(-2);
  const trailing = modifier?.type === 'TRIMMING_MODIFIER' ? /^[ \t\n\v\f\r]*/ : modifier?.type === 'LINE_TRIMMING_MODIFIER' ? /^[ \t\0\v]*/ : /^/;
  return tagEnd + (trailing.exec(source.slice(tagEnd))?.[0].length ?? 0);
}

function findVerbatimBodies(tags: PositionedToken[][], ours: PositionedToken[], source: string): Map<number, number> {
  return new Map(tags
    .filter((tagTokens) => tagTokens.some((token) => token.type === 'NAME' && token.value === 'endverbatim'))
    .map((tagTokens) => [(tagTokens[0]?.index ?? 0) - 1, endOfTwigsEndverbatimMatch(source, tagTokens)] as const)
    .filter(([bodyIndex]) => ours[bodyIndex]?.type === 'TEXT'));
}

// Returns the line Twig reports for text that starts at start.
function ourLineAsTwigCountsIt(template: Template, containing: PositionedToken, start: number): number {
  const endverbatimEnd = template.verbatimBodies.get(containing.index);
  if (endverbatimEnd === undefined) {
    return lineOfOffset(containing, start, template.source);
  }

  return lineOfOffset(containing, endverbatimEnd, template.source);
}

function compareText(twigToken: GoldenToken, start: number, template: Template): Comparison {
  const end = endOfNormalisedText(template.source, start, String(twigToken.value));
  if (end === undefined) {
    return { mismatches: [describeMismatch(twigToken, 'the source differs from Twig\'s text')], claimed: [] };
  }

  const text = { start, end };
  const containing = tokenContaining(template, start);
  if (!containing) {
    return { mismatches: [describeMismatch(twigToken, 'no token of ours covers it')], claimed: [], text };
  }

  const intruder = tokensOverlapping(template, containing, end).find((token) => token.type !== 'TEXT' || token.insideComment);
  const mismatches: string[] = [];
  if (intruder) {
    const where = intruder.insideComment ? 'inside our comment' : 'in our tokens';
    mismatches.push(describeMismatch(twigToken, `our ${intruder.type} ${JSON.stringify(intruder.value)} at offset ${intruder.start} is ${where}, but Twig has text there`));
  }
  const ourLine = ourLineAsTwigCountsIt(template, containing, start);
  if (ourLine !== twigToken.line) {
    mismatches.push(describeMismatch(twigToken, `our line is ${ourLine}`));
  }
  return { mismatches, claimed: [], text };
}

function compareTwigToken(twigToken: GoldenToken, template: Template): Comparison {
  const start = toUtf16Index(template, twigToken.offset);
  if (twigToken.type === 'text') {
    return compareText(twigToken, start, template);
  }

  const first = template.oursByStart.get(start);
  if (!first) {
    return { mismatches: [describeMismatch(twigToken, 'no token of ours starts here')], claimed: [] };
  }

  const span = spanOf(twigToken, first, template.ours);
  const shapeMismatch = typeMismatch(twigToken, span);
  if (shapeMismatch) {
    return { mismatches: [describeMismatch(twigToken, shapeMismatch)], claimed: span };
  }

  const reasons = [valueMismatch(twigToken, span), extentMismatch(twigToken, span, template), ...positionMismatches(twigToken, first, template)];
  return { mismatches: reasons.filter((reason) => reason !== undefined).map((reason) => describeMismatch(twigToken, reason)), claimed: span };
}

function closingQuoteOf(ours: PositionedToken[], openingQuote: PositionedToken): PositionedToken | undefined {
  let depth = 0;
  for (let index = openingQuote.index + 1; index < ours.length; index += 1) {
    const type = ours[index]?.type;
    if (type === 'OPENING_QUOTE') {
      depth += 1;
    }
    if (type === 'CLOSING_QUOTE' && depth === 0) {
      return ours[index];
    }
    if (type === 'CLOSING_QUOTE') {
      depth -= 1;
    }
  }
  return undefined;
}

function findQuotesOfStringsTwigLexesInParts(ours: PositionedToken[], claimed: Set<number>): PositionedToken[] {
  return ours.flatMap((token) => {
    const next = ours[token.index + 1];
    if (token.type !== 'OPENING_QUOTE' || token.value !== '"' || claimed.has(token.index)) {
      return [];
    }
    if (!next || !claimed.has(next.index) || !['STRING', 'INTERPOLATION_START'].includes(next.type)) {
      return [];
    }

    const closingQuote = closingQuoteOf(ours, token);
    return closingQuote ? [token, closingQuote] : [token];
  });
}

function findTokensWithoutTwigToken(template: Template, claimed: Set<number>): string[] {
  const silent = new Set([
    ...template.tagsConsumedByTwigLexer.flat(),
    ...findQuotesOfStringsTwigLexesInParts(template.ours, claimed),
  ].map((token) => token.index));
  return template.ours
    .filter((token) => !claimed.has(token.index) && !silent.has(token.index) && !token.insideComment && token.type !== 'TEXT' && !TYPES_TWIG_SKIPS.has(token.type))
    .map((token) => `our ${token.type} ${JSON.stringify(token.value)} at offset ${token.start} has no Twig token`);
}

function uncoveredRuns(token: PositionedToken, covered: Uint8Array): Range[] {
  const runs: Range[] = [];
  for (let offset = token.start; offset < token.end; offset += 1) {
    if (covered[offset]) {
      continue;
    }
    const previous = runs.at(-1);
    if (previous?.end === offset) {
      previous.end = offset + 1;
    } else {
      runs.push({ start: offset, end: offset + 1 });
    }
  }
  return runs;
}

function isTrimmedFromLeft(ours: PositionedToken[], text: PositionedToken): boolean {
  const endDelimiter = ours[text.index - 1];
  const modifier = ours[text.index - 2];
  return Boolean(endDelimiter && modifier && ['VARIABLE_END', 'TAG_END', 'COMMENT_END'].includes(endDelimiter.type) && MODIFIER_TYPES.has(modifier.type));
}

function isTrimmedFromRight(ours: PositionedToken[], text: PositionedToken): boolean {
  const beginDelimiter = ours[text.index + 1];
  const modifier = ours[text.index + 2];
  return Boolean(beginDelimiter && modifier && ['VARIABLE_START', 'TAG_START', 'COMMENT_START'].includes(beginDelimiter.type) && MODIFIER_TYPES.has(modifier.type));
}

function isWhitespaceTwigTrims(template: Template, text: PositionedToken, run: Range): boolean {
  if (!WHITESPACE_TWIG_TRIMS.test(template.source.slice(run.start, run.end))) {
    return false;
  }
  return (run.start === text.start && isTrimmedFromLeft(template.ours, text)) || (run.end === text.end && isTrimmedFromRight(template.ours, text));
}

function findTextTwigDoesNotHave(template: Template, twigTexts: Range[]): string[] {
  const covered = new Uint8Array(template.source.length);
  twigTexts.forEach((range) => covered.fill(1, range.start, range.end));
  return template.ours
    .filter((token) => token.type === 'TEXT' && !token.insideComment)
    .flatMap((text) => uncoveredRuns(text, covered).filter((run) => !isWhitespaceTwigTrims(template, text, run)).map((run) => ({ text, run })))
    .map(({ run }) => `our TEXT ${JSON.stringify(template.source.slice(run.start, run.end))} at offset ${run.start} is not text in Twig`);
}

function prepareTemplate(source: string): Template {
  const ours = positionTokens(new Lexer(3).tokenize(source));
  const lineStarts = findLineStarts(source);
  const tagsConsumedByTwigLexer = findTagsConsumedByTwigLexer(ours);
  return {
    source,
    ours,
    ourStarts: ours.map((token) => token.start),
    oursByStart: new Map(ours.filter((token) => token.value !== '' || token.type === 'EOF').map((token) => [token.start, token])),
    lineStarts,
    tagsConsumedByTwigLexer,
    columnsResetByLineTag: findColumnsResetByLineTag(tagsConsumedByTwigLexer, lineStarts, source.length),
    verbatimBodies: findVerbatimBodies(tagsConsumedByTwigLexer, ours, source),
    toUtf16: utf16IndexByByteOffset(source),
  };
}

export function findParityMismatches(source: string, golden: Golden): string[] {
  const template = prepareTemplate(source);
  const comparisons = golden.tokens.map((twigToken) => compareTwigToken(twigToken, template));
  const claimed = new Set(comparisons.flatMap((comparison) => comparison.claimed.map((token) => token.index)));
  const twigTexts = comparisons.flatMap((comparison) => (comparison.text ? [comparison.text] : []));

  return [
    ...comparisons.flatMap((comparison) => comparison.mismatches),
    ...findTokensWithoutTwigToken(template, claimed),
    ...findTextTwigDoesNotHave(template, twigTexts),
  ];
}
