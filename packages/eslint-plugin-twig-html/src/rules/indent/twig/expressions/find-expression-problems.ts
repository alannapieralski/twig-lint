import type { TwigBlockSummary, TwigStringSummary } from 'twig-eslint-parser';
import type { Problem } from '../../../../shared/problem.js';
import { expectedIndentAt, isChecked } from '../../expected-indent.js';
import { indentationProblem } from '../../indentation-problem.js';
import type { ResolvedOptions } from '../../options.js';
import type { IndentLayout } from '../../types.js';
import { findExpressionLines } from './expression-lines.js';

function firstContentOffsetOfLineAt(text: string, offset: number): number {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  return lineStart + (text.slice(lineStart).match(/^[ \t]*/)?.[0].length ?? 0);
}

function findBlockProblems(block: TwigBlockSummary, layout: IndentLayout, text: string, options: ResolvedOptions, strings: readonly TwigStringSummary[]): Problem[] {
  const startLineContent = firstContentOffsetOfLineAt(text, block.range[0]);
  const isLaidOut = isChecked(block.range[0], layout) && isChecked(startLineContent, layout);
  if (!isLaidOut) return [];

  const startLineIndentation = expectedIndentAt(startLineContent, layout, options);
  const lines = findExpressionLines({ text, block, startLineIndentation, unitText: options.unit.text, strings });

  return lines.flatMap((line) => indentationProblem(line, line.indentation, text, options));
}

export function findExpressionProblems(blocks: readonly TwigBlockSummary[], layout: IndentLayout, text: string, options: ResolvedOptions, strings: readonly TwigStringSummary[]): Problem[] {
  const multiLineBlocks = blocks.filter((block) => block.kind !== 'comment' && text.slice(...block.range).includes('\n'));
  return multiLineBlocks.flatMap((block) => findBlockProblems(block, layout, text, options, strings));
}
