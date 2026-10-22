import type { Problem } from '../../shared/problem.js';
import { expectedIndentAt, isChecked } from './expected-indent.js';
import { indentationProblem } from './indentation-problem.js';
import { findLineStarts } from './line-starts.js';
import type { ResolvedOptions } from './options.js';
import type { IndentLayout } from './types.js';

export function findNestingProblems(layout: IndentLayout, text: string, options: ResolvedOptions): Problem[] {
  const checkedLines = findLineStarts(text).filter((line) => isChecked(line.contentStart, layout));
  return checkedLines.flatMap((line) => indentationProblem(line, expectedIndentAt(line.contentStart, layout, options), text, options));
}
