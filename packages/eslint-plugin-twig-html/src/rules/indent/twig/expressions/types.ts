import type { TwigBlockSummary } from 'twig-eslint-parser';

export type LineContext = {
  readonly text: string;
  readonly block: TwigBlockSummary;
  readonly unitText: string;
  readonly lineStart: number;
  readonly contentStart: number;
  readonly indentationOfLineAt: (offset: number) => string;
  readonly chainHeads: ReadonlyMap<number, number>;
};

export type LineRule = (line: LineContext) => string | undefined;
