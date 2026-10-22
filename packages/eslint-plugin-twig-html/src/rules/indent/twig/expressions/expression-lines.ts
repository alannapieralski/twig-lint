import type { TwigBlockSummary, TwigStringSummary } from 'twig-eslint-parser';
import { isBlankFrom } from '../../line-starts.js';
import type { ExpressionLine } from '../../types.js';
import { bracketLevelOf, findClosedPair, outsideAnyBracket } from './bracket-pairs.js';
import { bracketRule } from './bracket-rule.js';
import { chainRule, isChainLine } from './chain-rule.js';
import type { LineContext, LineRule } from './types.js';

type ExpressionLayoutInput = {
  readonly text: string;
  readonly block: TwigBlockSummary;
  readonly startLineIndentation: string;
  readonly unitText: string;
  readonly strings: readonly TwigStringSummary[];
};

const leadingIndentation = /^[ \t]*/;

const lineRules: readonly LineRule[] = [chainRule, bracketRule];

function lineStartOf(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

function findLineStartsWithin(text: string, range: readonly [number, number]): number[] {
  const lineStarts: number[] = [];

  for (let lineBreak = text.indexOf('\n', range[0]); lineBreak !== -1 && lineBreak < range[1]; lineBreak = text.indexOf('\n', lineBreak + 1)) {
    lineStarts.push(lineBreak + 1);
  }

  return lineStarts;
}

function isInsideString(lineStart: number, strings: readonly TwigStringSummary[]): boolean {
  return strings.some((string) => string.range[0] < lineStart && lineStart < string.range[1]);
}

function findFirstIndentation(rules: readonly LineRule[], line: LineContext): string | undefined {
  for (const rule of rules) {
    const indentation = rule(line);
    if (indentation !== undefined) return indentation;
  }
  return undefined;
}

export function findExpressionLines(input: ExpressionLayoutInput): ExpressionLine[] {
  const { text, block, startLineIndentation, unitText, strings } = input;
  const startLineStart = lineStartOf(text, block.range[0]);
  const indentations = new Map<number, string>([[startLineStart, startLineIndentation]]);
  const chainHeads = new Map<number, number>([[outsideAnyBracket, startLineStart]]);
  const expressionLines: ExpressionLine[] = [];

  const indentationOfLineAt = (offset: number): string => {
    const lineStart = lineStartOf(text, offset);
    return indentations.get(lineStart) ?? text.slice(lineStart).match(leadingIndentation)?.[0] ?? '';
  };

  for (const lineStart of findLineStartsWithin(text, block.range)) {
    const contentStart = lineStart + (text.slice(lineStart).match(leadingIndentation)?.[0].length ?? 0);
    if (isBlankFrom(text, contentStart) || isInsideString(lineStart, strings)) continue;

    const line: LineContext = { text, block, unitText, lineStart, contentStart, indentationOfLineAt, chainHeads };
    const indentation = findFirstIndentation(lineRules, line);

    if (indentation !== undefined) {
      indentations.set(lineStart, indentation);
      expressionLines.push({ lineStart, contentStart, indentation });
    }

    const startsStatement = !isChainLine(text, contentStart) && !findClosedPair(line);
    if (startsStatement) chainHeads.set(bracketLevelOf(line), lineStart);
  }

  return expressionLines;
}
