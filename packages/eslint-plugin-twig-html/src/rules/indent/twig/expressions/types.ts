import type { TwigBlockSummary } from 'twig-eslint-parser';
import type { BracketLookup } from './bracket-pairs.js';
import type { Range } from '../../../../shared/range.js';

export type BracketPair = Range;

export type LineContext = {
  readonly text: string;
  readonly block: TwigBlockSummary;
  readonly unitText: string;
  readonly lineStart: number;
  readonly contentStart: number;
  readonly brackets: BracketLookup;
  readonly continuesPreviousLine: boolean;
  readonly indentationOfLineAt: (offset: number) => string;
  readonly chainHeads: ReadonlyMap<number, number>;
};

export type LineRule = (line: LineContext) => string | undefined;
