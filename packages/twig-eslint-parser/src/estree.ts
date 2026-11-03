import type { SourceLocation } from './source-text.js';

export type EstreeNode = {
  type: string;
  start: number;
  end: number;
  range: [number, number];
  loc: SourceLocation;
  [key: string]: unknown;
};
