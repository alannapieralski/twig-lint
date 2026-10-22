import type { Range } from '../../shared/range.js';
import type { OpenTag } from './html/types.js';

export type IndentLayout = {
  readonly nestings: readonly Range[];
  readonly skipped: readonly Range[];
  readonly depthUnknown: readonly Range[];
  readonly openTags: readonly OpenTag[];
  readonly closeTags: readonly Range[];
};

export type LineStart = { readonly lineStart: number; readonly contentStart: number };

export type ExpressionLine = LineStart & { readonly indentation: string };
