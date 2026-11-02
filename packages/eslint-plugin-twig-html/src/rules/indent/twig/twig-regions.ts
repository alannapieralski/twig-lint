import { findTransBodies } from '../../../shared/trans-bodies.js';
import type { TwigBlockSummary } from 'twig-eslint-parser';
import type { Range } from '../../../shared/range.js';
import type { TwigSegment } from '../../../shared/twig-segments.js';

export type TwigRegions = {
  readonly nestings: readonly Range[];
  readonly skipped: readonly Range[];
};

const UNINDENTED_TWIG_FRAMES: ReadonlySet<string> = new Set(['verbatim', 'raw']);

function findTwigInteriors(blocks: readonly TwigBlockSummary[]): Range[] {
  return blocks.map((block): Range => [block.range[0] + 1, block.range[1]]);
}

export function findTwigRegions(text: string, segments: readonly TwigSegment[], blocks: readonly TwigBlockSummary[]): TwigRegions {
  const unindentedSegments = segments.filter((segment) => UNINDENTED_TWIG_FRAMES.has(segment.frameName)).map((segment) => segment.range);

  return {
    nestings: segments.map((segment) => segment.range),
    skipped: [...findTwigInteriors(blocks), ...unindentedSegments, ...findTransBodies(text, blocks)],
  };
}
