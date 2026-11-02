import { findTwigSegments } from '../../shared/twig-segments.js';
import { buildIndentLayout } from './layout.js';
import { findNestingProblems } from './nesting-problems.js';
import { findExpressionProblems } from './twig/expressions/find-expression-problems.js';
import type { TwigStringSummary } from 'twig-eslint-parser';
import type { Problem } from '../../shared/problem.js';
import type { MarkupNode } from './html/types.js';
import type { LayoutSource } from './layout.js';
import type { ResolvedOptions } from './options.js';

export type MarkupProgram = { readonly body: readonly MarkupNode[] };

export type IndentSource = Omit<LayoutSource, 'ignores'> & { readonly strings: readonly TwigStringSummary[] };

export function findIndentProblems(program: MarkupProgram, source: IndentSource, options: ResolvedOptions): Problem[] {
  const { text, blocks, attributesOf, rawContentTags, strings, unreadableTagStarts } = source;
  const [document] = program.body;
  if (!document) {
    return [];
  }

  const segments = findTwigSegments(blocks);
  const layout = buildIndentLayout(document, segments, { text, blocks, attributesOf, ignores: options.ignores, rawContentTags, unreadableTagStarts });

  return [...findNestingProblems(layout, text, options), ...findExpressionProblems(blocks, layout, text, options, strings)];
}
