import type { Range } from '../../../shared/range.js';

export type TwigSegment = { readonly range: Range; readonly extent: Range; readonly frameStart: number; readonly frameName: string };
