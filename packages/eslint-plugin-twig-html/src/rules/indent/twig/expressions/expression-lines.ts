import { contentStartOf, indentationOf, lineStartOf } from '../../../../shared/line-text.js';
import { isBlankFrom } from '../../line-starts.js';
import { OUTSIDE_ANY_BRACKET, bracketLevelOf, findClosedPair } from './bracket-pairs.js';
import { bracketRule } from './bracket-rule.js';
import { chainRule, isChainLine } from './chain-rule.js';
import { continuesPreviousLine } from './line-continuation.js';
import type { TwigBlockSummary, TwigStringSummary } from 'twig-eslint-parser';
import type { Range } from '../../../../shared/range.js';
import type { ExpressionLine } from '../../types.js';
import type { LineContext, LineRule } from './types.js';

type ExpressionLayoutInput = {
  readonly text: string;
  readonly block: TwigBlockSummary;
  readonly startLineIndentation: string;
  readonly unitText: string;
  readonly strings: readonly TwigStringSummary[];
};

const LINE_RULES: readonly LineRule[] = [chainRule, bracketRule];

function findLineStartsWithin(text: string, range: Range): number[] {
  const lineStarts: number[] = [];
  let lineBreak = text.indexOf('\n', range[0]);

  while (lineBreak !== -1 && lineBreak < range[1]) {
    lineStarts.push(lineBreak + 1);
    lineBreak = text.indexOf('\n', lineBreak + 1);
  }

  return lineStarts;
}

function isInsideString(lineStart: number, strings: readonly TwigStringSummary[]): boolean {
  return strings.some((string) => string.range[0] < lineStart && lineStart < string.range[1]);
}

function findFirstIndentation(rules: readonly LineRule[], line: LineContext): string | undefined {
  for (const rule of rules) {
    const indentation = rule(line);
    if (indentation !== undefined) {
      return indentation;
    }
  }
  return undefined;
}

export function findExpressionLines(input: ExpressionLayoutInput): ExpressionLine[] {
  const { text, block, startLineIndentation, unitText, strings } = input;
  const startLineStart = lineStartOf(text, block.range[0]);
  const indentations = new Map<number, string>([[startLineStart, startLineIndentation]]);
  const chainHeads = new Map<number, number>([[OUTSIDE_ANY_BRACKET, startLineStart]]);
  const expressionLines: ExpressionLine[] = [];

  const indentationOfLineAt = (offset: number): string => {
    const lineStart = lineStartOf(text, offset);
    return indentations.get(lineStart) ?? indentationOf(text.slice(lineStart));
  };

  for (const lineStart of findLineStartsWithin(text, block.range)) {
    const contentStart = contentStartOf(text, lineStart);
    if (isBlankFrom(text, contentStart) || isInsideString(lineStart, strings)) {
      continue;
    }

    const isContinuation = continuesPreviousLine(text, block, lineStart);
    const line: LineContext = { text, block, unitText, lineStart, contentStart, continuesPreviousLine: isContinuation, indentationOfLineAt, chainHeads };
    const indentation = findFirstIndentation(LINE_RULES, line);

    if (indentation !== undefined) {
      indentations.set(lineStart, indentation);
      expressionLines.push({ lineStart, contentStart, indentation });
    }

    const startsElement = !isContinuation && !isChainLine(text, contentStart) && !findClosedPair(line);
    if (startsElement) {
      chainHeads.set(bracketLevelOf(line), lineStart);
    }
  }

  return expressionLines;
}
