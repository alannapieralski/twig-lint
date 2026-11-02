import { blankPreservingLineBreaks } from '../source-text.js';
import { isShortFormTag } from './blocks.js';
import {
  EXPRESSION_TAGS,
  INCLUDE_KEYWORDS_TO_BLANK,
  INCLUDE_TAGS,
  JAVASCRIPT_BY_TWIG_OPERATOR,
  JAVASCRIPT_BY_TWIG_TEST_OPERATOR,
  RESERVED_JAVA_SCRIPT_WORDS,
  TAGS_LEFT_UNCONVERTED,
  TWO_WORD_TESTS,
} from './syntax.js';
import { isSignificant } from './tokens.js';
import type { TwigBlock } from './blocks.js';
import type { TwigToken } from './tokens.js';

type ExpressionLayout = {
  readonly wrapInParentheses: boolean;
  readonly closeWithParenthesis?: boolean;
  readonly expressionStartIndex: number;
  readonly replacements: ReadonlyMap<number, string>;
};

type Frame = {
  readonly opener: 'root' | '(' | '[' | '{' | '#{';
  readonly closesComputedKey: boolean;
  hashExpects: 'key' | 'value' | undefined;
  readonly openQuestionMarkIndices: number[];
};

function padTo(replacement: string, length: number): string {
  if (replacement.length > length) {
    throw new Error(`Replacement "${replacement}" is longer than the ${length} characters it replaces.`);
  }
  return replacement.padEnd(length, ' ');
}

function isPunctuation(token: TwigToken | undefined, value: string): boolean {
  return token?.type === 'PUNCTUATION' && token.value === value;
}

function findNextSignificant(tokens: readonly TwigToken[], afterIndex: number, toIndex: number): TwigToken | undefined {
  for (let index = afterIndex + 1; index < toIndex; index += 1) {
    const token = tokens[index] as TwigToken;
    if (isSignificant(token)) {
      return token;
    }
  }
  return undefined;
}

function findTopLevelIndices(tokens: readonly TwigToken[]): Set<number> {
  const topLevelIndices = new Set<number>();
  let depth = 0;
  tokens.forEach((token, index) => {
    if (token.type === 'PUNCTUATION' && '([{'.includes(token.value)) {
      depth += 1;
    }
    if (token.type === 'INTERPOLATION_START' || token.type === 'OPENING_QUOTE') {
      depth += 1;
    }
    if (depth === 0) {
      topLevelIndices.add(index);
    }
    if (token.type === 'PUNCTUATION' && ')]}'.includes(token.value)) {
      depth -= 1;
    }
    if (token.type === 'INTERPOLATION_END' || token.type === 'CLOSING_QUOTE') {
      depth -= 1;
    }
  });
  return topLevelIndices;
}

function indexAfterTagName(block: TwigBlock): number {
  return block.tokens.findIndex((token) => token.type === 'NAME') + 1;
}

function lastWhitespaceBeforeClosing(tokens: readonly TwigToken[]): number {
  for (let index = tokens.length - 2; index >= 0; index -= 1) {
    const token = tokens[index] as TwigToken;
    if (token.type === 'WHITESPACE') {
      return index;
    }
    if (isSignificant(token)) {
      return -1;
    }
  }
  return -1;
}

function replaceFirstCharacter(token: TwigToken | undefined, character: string): string | undefined {
  if (token?.type !== 'WHITESPACE') {
    return undefined;
  }
  return `${character}${blankPreservingLineBreaks(token.value.slice(1))}`;
}

function describeSetLayout(block: TwigBlock, afterTagName: number, topLevelIndices: ReadonlySet<number>): ExpressionLayout {
  const tokens = block.tokens;
  const tagNameIndex = afterTagName - 1;
  const equalsIndex = tokens.findIndex((token, index) => topLevelIndices.has(index) && token.type === 'OPERATOR' && token.value === '=');
  const hasMultipleTargets = equalsIndex !== -1
    && tokens.some((token, index) => index > tagNameIndex && index < equalsIndex && topLevelIndices.has(index) && isPunctuation(token, ','));
  if (!hasMultipleTargets) {
    return { wrapInParentheses: false, expressionStartIndex: afterTagName, replacements: new Map([[tagNameIndex, 'var']]) };
  }

  const closingWhitespaceIndex = lastWhitespaceBeforeClosing(tokens);
  const bracketSlots: [number, string][] = [[afterTagName, '['], [equalsIndex - 1, ']'], [equalsIndex + 1, '['], [closingWhitespaceIndex, ']']];
  const bracketReplacements = bracketSlots.map(([index, bracket]) => [index, replaceFirstCharacter(tokens[index], bracket)] as const);
  if (bracketReplacements.some(([, replacement]) => replacement === undefined)) {
    return { wrapInParentheses: true, expressionStartIndex: afterTagName, replacements: new Map([[tagNameIndex, padTo('', 3)]]) };
  }

  return {
    wrapInParentheses: false,
    expressionStartIndex: afterTagName,
    replacements: new Map<number, string>([[tagNameIndex, 'var'], ...bracketReplacements.map(([index, replacement]) => [index, replacement as string] as const)]),
  };
}

function describeTagLayout(block: TwigBlock): ExpressionLayout | undefined {
  const tagName = block.tagName;
  if (!tagName || TAGS_LEFT_UNCONVERTED.has(tagName)) {
    return undefined;
  }

  const afterTagName = indexAfterTagName(block);
  const topLevelIndices = findTopLevelIndices(block.tokens);

  if (tagName === 'set') {
    return describeSetLayout(block, afterTagName, topLevelIndices);
  }
  if (EXPRESSION_TAGS.has(tagName)) {
    const replacements = new Map<number, string>();
    if (tagName === 'with') {
      block.tokens.forEach((token, index) => {
        if (topLevelIndices.has(index) && token.type === 'NAME' && token.value === 'only') {
          replacements.set(index, padTo('', token.value.length));
        }
      });
    }
    return { wrapInParentheses: true, expressionStartIndex: afterTagName, replacements };
  }
  if (tagName === 'block') {
    if (!isShortFormTag(block)) {
      return undefined;
    }
    const blockNameIndex = block.tokens.findIndex((token, index) => index >= afterTagName && isSignificant(token));
    return { wrapInParentheses: true, expressionStartIndex: blockNameIndex + 1, replacements: new Map() };
  }
  if (tagName === 'for') {
    const inIndex = block.tokens.findIndex((token, index) => topLevelIndices.has(index) && token.type === 'OPERATOR' && token.value === 'in');
    if (inIndex === -1) {
      return undefined;
    }
    const replacements = new Map<number, string>();
    block.tokens.forEach((token, index) => {
      if (index > inIndex && topLevelIndices.has(index) && token.type === 'NAME' && token.value === 'if') {
        replacements.set(index, padTo(',', token.value.length));
      }
    });
    return { wrapInParentheses: true, expressionStartIndex: inIndex + 1, replacements };
  }
  if (INCLUDE_TAGS.has(tagName)) {
    return describeIncludeLayout(block, tagName, afterTagName, topLevelIndices);
  }
  return undefined;
}

function describeIncludeLayout(block: TwigBlock, tagName: string, afterTagName: number, topLevelIndices: ReadonlySet<number>): ExpressionLayout {
  const keywordReplacements = new Map<number, string>();
  block.tokens.forEach((token, index) => {
    if (!topLevelIndices.has(index) || token.type !== 'NAME' || index < afterTagName) {
      return;
    }
    if (token.value === 'with') {
      keywordReplacements.set(index, padTo(',', token.value.length));
    }
    if (INCLUDE_KEYWORDS_TO_BLANK.has(token.value)) {
      keywordReplacements.set(index, padTo('', token.value.length));
    }
  });

  const whitespaceAfterTagName = block.tokens[afterTagName];
  if (whitespaceAfterTagName?.type !== 'WHITESPACE') {
    return { wrapInParentheses: true, expressionStartIndex: afterTagName, replacements: new Map([...keywordReplacements, [afterTagName - 1, padTo('', tagName.length)]]) };
  }

  return {
    wrapInParentheses: false,
    closeWithParenthesis: true,
    expressionStartIndex: afterTagName + 1,
    replacements: new Map([
      ...keywordReplacements,
      [afterTagName - 1, tagName],
      [afterTagName, `(${blankPreservingLineBreaks(whitespaceAfterTagName.value.slice(1))}`],
    ]),
  };
}

function describeLayout(block: TwigBlock): ExpressionLayout | undefined {
  if (block.kind === 'comment') {
    return undefined;
  }
  if (block.kind === 'print') {
    return { wrapInParentheses: true, expressionStartIndex: 1, replacements: new Map() };
  }
  return describeTagLayout(block);
}

function findMatchingClosingQuote(tokens: readonly TwigToken[], openingIndex: number): number {
  let depth = 0;
  for (let index = openingIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.type === 'OPENING_QUOTE') {
      depth += 1;
    }
    if (token?.type === 'CLOSING_QUOTE') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error(`Twig string opened at offset ${tokens[openingIndex]?.start} has no closing quote.`);
}

function canBecomeTemplateLiteral(tokens: readonly TwigToken[], openingIndex: number, closingIndex: number): boolean {
  let depth = 0;
  for (let index = openingIndex + 1; index < closingIndex; index += 1) {
    const token = tokens[index];
    if (token?.type === 'INTERPOLATION_START') {
      depth += 1;
    }
    if (token?.type === 'INTERPOLATION_END') {
      depth -= 1;
    }
    if (depth === 0 && token?.type === 'STRING' && (token.value.includes('`') || token.value.includes('${'))) {
      return false;
    }
  }
  return true;
}

function classifyColon(frame: Frame, previous: TwigToken | undefined, beforePrevious: TwigToken | undefined): 'hash-key' | 'named-argument' | 'ternary' {
  if (frame.opener === '{' && frame.hashExpects === 'key') {
    return 'hash-key';
  }

  const followsArgumentName = previous?.type === 'NAME' && (isPunctuation(beforePrevious, '(') || isPunctuation(beforePrevious, ','));
  if (frame.opener === '(' && !frame.closesComputedKey && followsArgumentName && frame.openQuestionMarkIndices.length === 0) {
    return 'named-argument';
  }
  return 'ternary';
}

function isUntouchedBlankAt(tokens: readonly TwigToken[], pieces: readonly string[], index: number, edge: 'first' | 'last'): boolean {
  const token = tokens[index];
  const character = edge === 'first' ? token?.value[0] : token?.value.at(-1);
  return token?.type === 'WHITESPACE' && pieces[index] === token.value && (character === ' ' || character === '\t');
}

function isOpener(token: TwigToken): boolean {
  return (token.type === 'PUNCTUATION' && '([{'.includes(token.value)) || token.type === 'OPENING_QUOTE' || token.type === 'INTERPOLATION_START';
}

function isCloser(token: TwigToken): boolean {
  return (token.type === 'PUNCTUATION' && ')]}'.includes(token.value)) || token.type === 'CLOSING_QUOTE' || token.type === 'INTERPOLATION_END';
}

function findPartnerIndex(tokens: readonly TwigToken[], index: number, step: 1 | -1): number {
  let depth = 0;
  for (let candidate = index; candidate >= 0 && candidate < tokens.length; candidate += step) {
    const token = tokens[candidate] as TwigToken;
    if (isOpener(token)) {
      depth += step;
    }
    if (isCloser(token)) {
      depth -= step;
    }
    if (depth === 0) {
      return candidate;
    }
  }
  throw new Error(`Twig bracket at offset ${tokens[index]?.start} has no partner.`);
}

function isOperandPart(token: TwigToken): boolean {
  if (token.type === 'NAME' || token.type === 'NUMBER') {
    return true;
  }
  return isPunctuation(token, '.') || isPunctuation(token, '|') || (token.type === 'OPERATOR' && token.value === '?.');
}

function isNullCoalescing(token: TwigToken | undefined): boolean {
  return token?.type === 'OPERATOR' && token.value === '??';
}

function isBindingNeighbour(token: TwigToken | undefined): boolean {
  if (token?.type === 'TEST_OPERATOR') {
    return true;
  }
  return (token?.type === 'OPERATOR' && token.value !== '=') || isPunctuation(token, '?');
}

type ExpressionSpan = { readonly fromIndex: number; readonly toIndex: number; readonly replacements: ReadonlyMap<number, string> };

function findPreviousSignificantIndex(tokens: readonly TwigToken[], span: ExpressionSpan, beforeIndex: number): number | undefined {
  for (let index = beforeIndex - 1; index >= span.fromIndex; index -= 1) {
    if (isSignificant(tokens[index] as TwigToken)) {
      return index;
    }
  }
  return undefined;
}

function findNextSignificantIndex(tokens: readonly TwigToken[], span: ExpressionSpan, afterIndex: number): number | undefined {
  for (let index = afterIndex + 1; index < span.toIndex; index += 1) {
    if (isSignificant(tokens[index] as TwigToken)) {
      return index;
    }
  }
  return undefined;
}

function findLeftOperandStart(tokens: readonly TwigToken[], span: ExpressionSpan, operatorIndex: number): number {
  let start = operatorIndex;
  for (let index = findPreviousSignificantIndex(tokens, span, operatorIndex); index !== undefined; index = findPreviousSignificantIndex(tokens, span, start)) {
    const token = tokens[index] as TwigToken;
    if (span.replacements.has(index)) {
      break;
    }
    if (isCloser(token)) {
      start = findPartnerIndex(tokens, index, -1);
    } else if (isOperandPart(token)) {
      start = index;
    } else {
      break;
    }
  }
  return start;
}

function findRightOperandEnd(tokens: readonly TwigToken[], span: ExpressionSpan, operatorIndex: number): number {
  let end = operatorIndex;
  for (let index = findNextSignificantIndex(tokens, span, operatorIndex); index !== undefined; index = findNextSignificantIndex(tokens, span, end)) {
    const token = tokens[index] as TwigToken;
    const isUnaryPrefix = end === operatorIndex && token.type === 'OPERATOR' && ['not', '-', '+'].includes(token.value);
    if (span.replacements.has(index)) {
      break;
    }
    if (isOpener(token)) {
      end = findPartnerIndex(tokens, index, 1);
    } else if (isOperandPart(token) || isUnaryPrefix) {
      end = index;
    } else {
      break;
    }
  }
  return end;
}

function bracketNullCoalescing(tokens: readonly TwigToken[], span: ExpressionSpan, pieces: string[]): void {
  const bracketedOperatorIndices = new Set<number>();
  for (let index = span.fromIndex; index < span.toIndex; index += 1) {
    if (!isNullCoalescing(tokens[index]) || bracketedOperatorIndices.has(index)) {
      continue;
    }

    const chainOperatorIndices = [index];
    let end = findRightOperandEnd(tokens, span, index);
    for (let next = findNextSignificantIndex(tokens, span, end); next !== undefined && isNullCoalescing(tokens[next]); next = findNextSignificantIndex(tokens, span, end)) {
      chainOperatorIndices.push(next);
      end = findRightOperandEnd(tokens, span, next);
    }
    chainOperatorIndices.forEach((operatorIndex) => bracketedOperatorIndices.add(operatorIndex));

    const start = findLeftOperandStart(tokens, span, index);
    const before = findPreviousSignificantIndex(tokens, span, start);
    const after = findNextSignificantIndex(tokens, span, end);
    const isMixed = (before !== undefined && isBindingNeighbour(tokens[before])) || (after !== undefined && isBindingNeighbour(tokens[after]));
    if (!isMixed) {
      continue;
    }

    const openingIndex = start - 1;
    const closingIndex = end + 1;
    const hasRoomForBrackets = openingIndex >= span.fromIndex && closingIndex < span.toIndex
      && isUntouchedBlankAt(tokens, pieces, openingIndex, 'last') && isUntouchedBlankAt(tokens, pieces, closingIndex, 'first');
    if (!hasRoomForBrackets) {
      chainOperatorIndices.forEach((operatorIndex) => {
        pieces[operatorIndex] = '||';
      });
      continue;
    }
    pieces[openingIndex] = `${(pieces[openingIndex] as string).slice(0, -1)}(`;
    pieces[closingIndex] = `)${(pieces[closingIndex] as string).slice(1)}`;
  }
}

function mapExpression(tokens: readonly TwigToken[], fromIndex: number, toIndex: number, pieces: string[], replacements: ReadonlyMap<number, string>): void {
  const frames: Frame[] = [{ opener: 'root', closesComputedKey: false, hashExpects: undefined, openQuestionMarkIndices: [] }];
  const templateLiteralQuoteIndices = new Set<number>();
  const recentSignificant: TwigToken[] = [];
  const currentFrame = () => frames[frames.length - 1] as Frame;
  const isUntouchedBlank = (index: number, edge: 'first' | 'last') => isUntouchedBlankAt(tokens, pieces, index, edge);
  const resolveShortTernaries = (frame: Frame) => {
    for (const index of frame.openQuestionMarkIndices.splice(0)) {
      pieces[index] = '&';
      if (isUntouchedBlank(index + 1, 'first')) {
        pieces[index + 1] = `&${(pieces[index + 1] as string).slice(1)}`;
      } else if (isUntouchedBlank(index - 1, 'last')) {
        pieces[index - 1] = `${(pieces[index - 1] as string).slice(0, -1)}&`;
      }
    }
  };

  for (let index = fromIndex; index < toIndex; index += 1) {
    const token = tokens[index] as TwigToken;
    const frame = currentFrame();
    const previous = recentSignificant.at(-1);
    const beforePrevious = recentSignificant.at(-2);

    const replacement = replacements.get(index);
    if (replacement !== undefined) {
      pieces[index] = replacement;
      if (replacement.trim() === ',') {
        resolveShortTernaries(frame);
      }
      recentSignificant.push(token);
      continue;
    }
    if (!isSignificant(token)) {
      pieces[index] = token.type === 'WHITESPACE' ? token.value : blankPreservingLineBreaks(token.value);
      continue;
    }

    pieces[index] = token.value;
    switch (token.type) {
      case 'OPERATOR': {
        const normalisedOperator = token.value.replace(/\s+/g, ' ');
        const javascript = JAVASCRIPT_BY_TWIG_OPERATOR[normalisedOperator];
        if (javascript !== undefined) {
          pieces[index] = padTo(javascript, token.value.length);
        }
        break;
      }
      case 'NUMBER': {
        const isAttributeAccess = isPunctuation(previous, '.');
        const next = findNextSignificant(tokens, index, toIndex);
        const hasMemberAfter = isPunctuation(next, '.') || isPunctuation(next, '|');
        if (isAttributeAccess || hasMemberAfter) {
          pieces[index] = `_${token.value.slice(1).replace(/[^A-Za-z0-9_]/g, '_')}`;
        }
        break;
      }
      case 'TEST_OPERATOR': {
        const normalisedOperator = token.value.replace(/\s+/g, ' ');
        pieces[index] = padTo(JAVASCRIPT_BY_TWIG_TEST_OPERATOR[normalisedOperator] ?? '==', token.value.length);
        break;
      }
      case 'NAME': {
        const isPropertyName = isPunctuation(previous, '.') || isPunctuation(previous, '|') || (previous?.type === 'OPERATOR' && previous.value === '?.');
        const isHashKey = frame.opener === '{' && frame.hashExpects === 'key';
        const secondTestWord = previous?.type === 'NAME' && beforePrevious?.type === 'TEST_OPERATOR' ? TWO_WORD_TESTS[previous.value] : undefined;
        if (secondTestWord === token.value) {
          pieces[index] = padTo('', token.value.length);
        } else if (!isPropertyName && !isHashKey && RESERVED_JAVA_SCRIPT_WORDS.has(token.value)) {
          pieces[index] = `_${token.value.slice(1)}`;
        }
        break;
      }
      case 'PUNCTUATION': {
        if (token.value === '|') {
          pieces[index] = '.';
        }
        if (token.value === '.' && isPunctuation(findNextSignificant(tokens, index, toIndex), '(')) {
          pieces[index] = ' ';
        }
        if (token.value === '?') {
          frame.openQuestionMarkIndices.push(index);
        }
        if (token.value === ':') {
          const colonKind = classifyColon(frame, previous, beforePrevious);
          if (colonKind === 'hash-key') {
            frame.hashExpects = 'value';
          }
          if (colonKind === 'named-argument') {
            pieces[index] = '=';
          }
          if (colonKind === 'ternary') {
            frame.openQuestionMarkIndices.pop();
          }
        }
        if (token.value === ',') {
          resolveShortTernaries(frame);
          if (frame.opener === '{') {
            frame.hashExpects = 'key';
          }
        }
        if (token.value === '(') {
          const isComputedKey = frame.opener === '{' && frame.hashExpects === 'key';
          if (isComputedKey) {
            pieces[index] = '[';
          }
          frames.push({ opener: '(', closesComputedKey: isComputedKey, hashExpects: undefined, openQuestionMarkIndices: [] });
        }
        if (token.value === '[') {
          frames.push({ opener: '[', closesComputedKey: false, hashExpects: undefined, openQuestionMarkIndices: [] });
        }
        if (token.value === '{') {
          frames.push({ opener: '{', closesComputedKey: false, hashExpects: 'key', openQuestionMarkIndices: [] });
        }
        if (')]}'.includes(token.value) && frames.length > 1) {
          resolveShortTernaries(frame);
          if (frame.closesComputedKey) {
            pieces[index] = ']';
          }
          frames.pop();
        }
        break;
      }
      case 'OPENING_QUOTE': {
        const isHashKey = frame.opener === '{' && frame.hashExpects === 'key';
        if (isHashKey) {
          break;
        }
        const closingIndex = findMatchingClosingQuote(tokens, index);
        if (canBecomeTemplateLiteral(tokens, index, closingIndex)) {
          pieces[index] = '`';
          templateLiteralQuoteIndices.add(closingIndex);
        }
        break;
      }
      case 'CLOSING_QUOTE': {
        if (templateLiteralQuoteIndices.has(index)) {
          pieces[index] = '`';
        }
        break;
      }
      case 'INTERPOLATION_START': {
        pieces[index] = '${';
        frames.push({ opener: '#{', closesComputedKey: false, hashExpects: undefined, openQuestionMarkIndices: [] });
        break;
      }
      case 'INTERPOLATION_END': {
        resolveShortTernaries(frame);
        if (frames.length > 1) {
          frames.pop();
        }
        break;
      }
      default:
        break;
    }
    recentSignificant.push(token);
  }

  frames.forEach(resolveShortTernaries);
}

export function toSameLengthJavaScript(block: TwigBlock): string | undefined {
  const layout = describeLayout(block);
  if (!layout) {
    return undefined;
  }

  const tokens = block.tokens;
  const closingIndex = tokens.length - 1;
  const pieces = tokens.map((token) => blankPreservingLineBreaks(token.value));
  mapExpression(tokens, layout.expressionStartIndex, closingIndex, pieces, layout.replacements);
  bracketNullCoalescing(tokens, { fromIndex: layout.expressionStartIndex, toIndex: closingIndex, replacements: layout.replacements }, pieces);

  for (const [index, replacement] of layout.replacements) {
    if (index < layout.expressionStartIndex) {
      pieces[index] = replacement;
    }
  }
  const closing = tokens[closingIndex] as TwigToken;
  if (layout.wrapInParentheses) {
    const opening = tokens[0] as TwigToken;
    pieces[0] = `(${blankPreservingLineBreaks(opening.value.slice(1))}`;
  }
  if (layout.wrapInParentheses || layout.closeWithParenthesis) {
    pieces[closingIndex] = ` )${blankPreservingLineBreaks(closing.value.slice(2))}`;
  }

  const code = pieces.join('');
  if (code.length !== block.end - block.start) {
    throw new Error(`Twig block at offset ${block.start} became ${code.length} characters of JavaScript instead of ${block.end - block.start}.`);
  }
  return code;
}
