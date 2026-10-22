import type { Problem } from '../../shared/problem.js';
import { describeIndentation } from './describe-indentation.js';
import type { ResolvedOptions } from './options.js';
import type { LineStart } from './types.js';

export function indentationProblem(line: LineStart, expected: string, text: string, options: ResolvedOptions): Problem[] {
  const actual = text.slice(line.lineStart, line.contentStart);
  if (actual === expected) return [];

  const range = [line.lineStart, line.contentStart] as const;

  return [{
    range,
    messageId: 'wrongIndentation',
    data: {
      expected: describeIndentation(expected, options.unit.name),
      actual: describeIndentation(actual, options.unit.name),
    },
    edits: [{ range, text: expected }],
  }];
}
