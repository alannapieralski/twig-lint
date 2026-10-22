import type { TwigBlockSummary } from 'twig-eslint-parser';
import type { TwigSegment } from './types.js';

type OpenFrame = { readonly name: string; readonly frameStart: number; readonly segmentStart: number; readonly boundaryStart: number };

const middleTagNames: ReadonlySet<string> = new Set(['else', 'elseif', 'plural']);

export function twigBlockEnd(block: TwigBlockSummary, text: string): number {
  return text.lastIndexOf('}', block.range[1] - 1) + 1;
}

function isOpener(block: TwigBlockSummary): boolean {
  return block.kind === 'tag' && block.depthChange === 1;
}

function isCloser(block: TwigBlockSummary): boolean {
  return block.kind === 'tag' && block.depthChange === -1;
}

function isMiddle(block: TwigBlockSummary): boolean {
  return block.kind === 'tag' && middleTagNames.has(block.tagName ?? '');
}

function closesFrame(block: TwigBlockSummary, frame: OpenFrame): boolean {
  return block.tagName === `end${frame.name}`;
}

export function findTwigSegments(blocks: readonly TwigBlockSummary[], text: string): TwigSegment[] | undefined {
  const openFrames: OpenFrame[] = [];
  const segments: TwigSegment[] = [];

  for (const block of blocks) {
    if (isOpener(block)) {
      openFrames.push({ name: block.tagName ?? '', frameStart: block.range[0], segmentStart: twigBlockEnd(block, text), boundaryStart: block.range[0] });
      continue;
    }

    const isFrameBoundary = isMiddle(block) || isCloser(block);
    if (!isFrameBoundary) continue;

    const frame = openFrames.pop();
    if (!frame) return undefined;
    if (isCloser(block) && !closesFrame(block, frame)) return undefined;

    segments.push({
      range: [frame.segmentStart, block.range[0]],
      extent: [frame.boundaryStart, twigBlockEnd(block, text)],
      frameStart: frame.frameStart,
      frameName: frame.name,
    });

    if (isMiddle(block)) openFrames.push({ ...frame, segmentStart: twigBlockEnd(block, text), boundaryStart: block.range[0] });
  }

  const isEveryFrameClosed = openFrames.length === 0;
  return isEveryFrameClosed ? segments : undefined;
}
