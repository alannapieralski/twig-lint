import type { TwigBlockSummary } from 'twig-eslint-parser';
import type { Range } from '../../../shared/range.js';
import { twigBlockEnd } from './twig-frames.js';
import type { TwigSegment } from './types.js';

export type TwigRegions = {
  readonly nestings: readonly Range[];
  readonly skipped: readonly Range[];
};

const unindentedTwigFrames: ReadonlySet<string> = new Set(['verbatim', 'raw']);

function findTwigInteriors(blocks: readonly TwigBlockSummary[], text: string): Range[] {
  return blocks.map((block): Range => [block.range[0] + 1, twigBlockEnd(block, text)]);
}

export function findTwigRegions(segments: readonly TwigSegment[], blocks: readonly TwigBlockSummary[], text: string): TwigRegions {
  const unindentedSegments = segments.filter((segment) => unindentedTwigFrames.has(segment.frameName)).map((segment) => segment.range);

  return {
    nestings: segments.map((segment) => segment.range),
    skipped: [...findTwigInteriors(blocks, text), ...unindentedSegments],
  };
}
