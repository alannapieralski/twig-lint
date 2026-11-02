import type { Range } from '../../shared/range.js';
import type { OpenTag } from './html/types.js';
import type { RangeCoverage } from './range-lookup.js';

export type IndentLayout = {
  readonly nestings: RangeCoverage;
  readonly skipped: RangeCoverage;
  readonly depthUnknown: RangeCoverage;
  readonly findOpenTagAt: (offset: number) => OpenTag | undefined;
  readonly findCloseTagAt: (offset: number) => Range | undefined;
};

export type LineStart = { readonly lineStart: number; readonly contentStart: number };

export type ExpressionLine = LineStart & { readonly indentation: string };
