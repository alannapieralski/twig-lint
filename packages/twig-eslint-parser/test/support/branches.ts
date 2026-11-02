import { groupTwigBlocks, summariseTwigBlocks } from '../../src/twig/blocks.js';
import { tokenizeTwig } from '../../src/twig/tokens.js';
import type { TwigBlockSummary } from '../../src/twig/blocks.js';

export type BranchSegment = { readonly groupId: number; readonly branchIndex: number; readonly start: number; readonly end: number };

type MaybeClosedTag = { readonly name: string; readonly openStart: number; readonly isClosed: boolean };
type Role = 'start' | 'continue' | 'end' | 'blockOpen' | 'blockClose';
type Frame = { readonly kind: 'if'; readonly groupId: number; branchIndex: number; segmentStart: number } | { readonly kind: 'block' };

const TAGS_THAT_SCOPE_BRANCHES: ReadonlySet<string> = new Set(['for', 'block', 'macro', 'embed', 'autoescape', 'sandbox', 'with']);

function roleOf(block: TwigBlockSummary): Role | undefined {
  const { tagName } = block;
  if (block.kind !== 'tag' || tagName === undefined) {
    return undefined;
  }
  if (tagName === 'if') {
    return 'start';
  }
  if (tagName === 'elseif' || tagName === 'else') {
    return 'continue';
  }
  if (tagName === 'endif') {
    return 'end';
  }
  if (tagName.startsWith('end') && TAGS_THAT_SCOPE_BRANCHES.has(tagName.slice('end'.length))) {
    return 'blockClose';
  }
  if (TAGS_THAT_SCOPE_BRANCHES.has(tagName) && block.depthChange === 1) {
    return 'blockOpen';
  }
  return undefined;
}

function splitIntoBranches(blocks: readonly TwigBlockSummary[]): BranchSegment[] {
  const branchSegments: BranchSegment[] = [];
  const stack: Frame[] = [];
  let nextGroupId = 0;

  for (const block of blocks) {
    const role = roleOf(block);
    if (role === undefined) {
      continue;
    }
    const [start, end] = block.range;
    const top = stack.at(-1);
    switch (role) {
      case 'start':
        stack.push({ kind: 'if', groupId: nextGroupId++, branchIndex: 0, segmentStart: end });
        break;
      case 'blockOpen':
        stack.push({ kind: 'block' });
        break;
      case 'continue':
        if (top?.kind !== 'if') {
          break;
        }
        branchSegments.push({ groupId: top.groupId, branchIndex: top.branchIndex, start: top.segmentStart, end: start });
        top.branchIndex += 1;
        top.segmentStart = end;
        break;
      case 'end':
        if (top?.kind !== 'if') {
          break;
        }
        stack.pop();
        branchSegments.push({ groupId: top.groupId, branchIndex: top.branchIndex, start: top.segmentStart, end: start });
        break;
      case 'blockClose':
        if (top?.kind === 'block') {
          stack.pop();
        }
        break;
    }
  }
  return branchSegments;
}

export function branchSegmentsOf(source: string): readonly BranchSegment[] {
  return splitIntoBranches(summariseTwigBlocks(groupTwigBlocks(tokenizeTwig(source))));
}

export function isInsideABranch(offset: number, segments: readonly BranchSegment[]): boolean {
  return segments.some((segment) => segment.start <= offset && offset < segment.end);
}

function comparableName(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase();
}

// Tells whether a close tag the tree does not use can be explained by an element of that name left open inside a Twig branch.
export function isClosedInAnotherBranch(segments: readonly BranchSegment[], closeStart: number, closeName: string, tags: readonly MaybeClosedTag[]): boolean {
  return tags.some((tag) => !tag.isClosed && tag.openStart < closeStart && comparableName(tag.name) === comparableName(closeName) && isInsideABranch(tag.openStart, segments));
}
