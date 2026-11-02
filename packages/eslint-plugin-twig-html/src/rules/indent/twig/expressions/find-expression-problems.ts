import { contentStartOf, lineStartOf } from '../../../../shared/line-text.js';
import { expectedIndentAt, isChecked } from '../../expected-indent.js';
import { indentationProblem } from '../../indentation-problem.js';
import { createRangeCoverage, interiorOf } from '../../range-lookup.js';
import { findExpressionLines } from './expression-lines.js';
import type { TwigBlockSummary, TwigStringSummary } from 'twig-eslint-parser';
import type { Problem } from '../../../../shared/problem.js';
import type { ResolvedOptions } from '../../options.js';
import type { IndentLayout } from '../../types.js';

function findBlockProblems(block: TwigBlockSummary, layout: IndentLayout, text: string, options: ResolvedOptions, isInsideString: (offset: number) => boolean): Problem[] {
  const startLineContent = contentStartOf(text, lineStartOf(text, block.range[0]));
  const isLaidOut = isChecked(block.range[0], layout) && isChecked(startLineContent, layout);
  if (!isLaidOut) return [];

  const startLineIndentation = expectedIndentAt(startLineContent, layout, options);
  const lines = findExpressionLines({ text, block, startLineIndentation, unitText: options.unit.text, isInsideString });

  return lines.flatMap((line) => indentationProblem(line, line.indentation, text, options));
}

export function findExpressionProblems(blocks: readonly TwigBlockSummary[], layout: IndentLayout, text: string, options: ResolvedOptions, strings: readonly TwigStringSummary[]): Problem[] {
  const stringInteriors = createRangeCoverage(strings.map((string) => interiorOf(string.range)));
  const multiLineBlocks = blocks.filter((block) => block.kind !== 'comment' && text.slice(...block.range).includes('\n'));
  return multiLineBlocks.flatMap((block) => findBlockProblems(block, layout, text, options, stringInteriors.covers));
}
