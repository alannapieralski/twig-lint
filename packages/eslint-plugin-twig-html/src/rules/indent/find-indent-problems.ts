import type { TwigBlockSummary, TwigStringSummary } from 'twig-eslint-parser';
import type { Problem } from '../../shared/problem.js';
import type { AttributesOf } from '../../shared/tag-attributes.js';
import type { MarkupNode } from './html/types.js';
import { buildIndentLayout } from './layout.js';
import { findNestingProblems } from './nesting-problems.js';
import type { ResolvedOptions } from './options.js';
import { findExpressionProblems } from './twig/expressions/find-expression-problems.js';
import { findTwigSegments } from './twig/twig-frames.js';

export type MarkupProgram = { readonly body: readonly MarkupNode[] };

export type IndentSource = {
  readonly text: string;
  readonly blocks: readonly TwigBlockSummary[];
  readonly attributesOf: AttributesOf;
  readonly rawContentTags: readonly string[];
  readonly strings: readonly TwigStringSummary[];
  readonly unsoundTagStarts: ReadonlySet<number>;
};

export function findIndentProblems(program: MarkupProgram, source: IndentSource, options: ResolvedOptions): Problem[] {
  const { text, blocks, attributesOf, rawContentTags, strings, unsoundTagStarts } = source;
  const [document] = program.body;
  if (!document) return [];

  const segments = findTwigSegments(blocks, text);
  if (!segments) return [];

  const layout = buildIndentLayout(document, segments, { text, blocks, attributesOf, ignores: options.ignores, rawContentTags, unsoundTagStarts });

  return [...findNestingProblems(layout, text, options), ...findExpressionProblems(blocks, layout, text, options, strings)];
}
