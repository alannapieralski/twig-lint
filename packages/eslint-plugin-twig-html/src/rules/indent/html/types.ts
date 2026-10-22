import type { Range } from '../../../shared/range.js';
import type { Token } from '../../../shared/tag-node.js';

export type MarkupNode = {
  readonly type: string;
  readonly range: Range;
  readonly name?: string;
  readonly openStart?: Token;
  readonly openEnd?: Token;
  readonly close?: Token | null;
  readonly children?: readonly MarkupNode[];
  readonly attributes?: readonly { readonly range: Range }[];
};

export type Element = MarkupNode & { readonly openStart: Token };

export type OpenTag = {
  readonly start: number;
  readonly attributesStart: number;
  readonly closeBracketStart: number;
  readonly isSelfClosing: boolean;
  readonly firstAttributeColumn: number | undefined;
  readonly lineIndentationAsWritten: string | undefined;
};
