import type { Range } from '../../shared/range.js';
import { bodyOf, extentOf, openTagOf } from './html/html-elements.js';
import type { Element } from './html/types.js';
import type { TwigSegment } from './twig/types.js';

export type Seams = {
  readonly splitOpenTags: readonly Range[];
  readonly branchSplitContent: readonly Range[];
};

type CrossingSpan = { readonly range: Range; readonly splitsOpenTag: boolean };

function isCrossing(first: Range, second: Range): boolean {
  const firstStartsOutside = first[0] < second[0] && second[0] < first[1] && first[1] < second[1];
  const secondStartsOutside = second[0] < first[0] && first[0] < second[1] && second[1] < first[1];
  return firstStartsOutside || secondStartsOutside;
}

function frameExtentOf(segment: TwigSegment, segments: readonly TwigSegment[]): Range {
  const frameEnds = segments.filter((candidate) => candidate.frameStart === segment.frameStart).map((candidate) => candidate.extent[1]);
  return [segment.frameStart, Math.max(...frameEnds)];
}

function findCrossingSpans(elements: readonly Element[], segments: readonly TwigSegment[]): CrossingSpan[] {
  return elements.flatMap((element) => {
    const extent = extentOf(element);
    const inner = bodyOf(element) ?? extent;
    const openTag = openTagOf(element);
    const isInsideOpenTag = (offset: number) => openTag[0] < offset && offset < openTag[1];
    const crossedSegments = segments.filter((segment) => isCrossing(extent, segment.extent));

    return crossedSegments.map((segment): CrossingSpan => {
      const frameExtent = frameExtentOf(segment, segments);
      const splitsOpenTag = isInsideOpenTag(frameExtent[0]) || isInsideOpenTag(frameExtent[1]);
      const start = splitsOpenTag ? extent[0] : Math.min(inner[0], frameExtent[0]);
      return { range: [start, Math.max(inner[1], frameExtent[1])], splitsOpenTag };
    });
  });
}

export function findSeams(elements: readonly Element[], segments: readonly TwigSegment[]): Seams {
  const crossingSpans = findCrossingSpans(elements, segments);

  return {
    splitOpenTags: crossingSpans.filter((span) => span.splitsOpenTag).map((span) => span.range),
    branchSplitContent: crossingSpans.filter((span) => !span.splitsOpenTag).map((span) => span.range),
  };
}
