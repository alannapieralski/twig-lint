import type { TwigBlockSummary } from '../../src/twig/blocks.js';
import { describe, expect, it } from 'vitest';
import { depthChangeWithin, isTwigBalancedWithin } from '../../src/twig/balance.js';

const block = (tagName: string, start: number, depthChange: TwigBlockSummary['depthChange']): TwigBlockSummary => ({
  kind: 'tag',
  tagName,
  range: [start, start + 5],
  depthChange,
  bracketPairs: [],
});

const ifBlock = block('if', 0, 1);
const elseBlock = block('else', 10, 0);
const endifBlock = block('endif', 20, -1);
const blocks = [ifBlock, elseBlock, endifBlock];

describe('depthChangeWithin', () => {
  it('adds the depth change of every block inside the range', () => {
    expect(depthChangeWithin([0, 25], blocks)).toBe(0);
    expect(depthChangeWithin([0, 15], blocks)).toBe(1);
  });

  it('ignores blocks that start before the range or end after it', () => {
    expect(depthChangeWithin([1, 22], blocks)).toBe(0);
    expect(depthChangeWithin([21, 30], blocks)).toBe(0);
  });
});

describe('isTwigBalancedWithin', () => {
  it('accepts a range holding a whole if, else and endif', () => {
    expect(isTwigBalancedWithin([0, 25], blocks)).toBe(true);
  });

  it('rejects a range that opens a block without closing it', () => {
    expect(isTwigBalancedWithin([0, 15], blocks)).toBe(false);
  });

  it('rejects a range that closes a block it did not open', () => {
    expect(isTwigBalancedWithin([20, 25], blocks)).toBe(false);
  });

  it('rejects a range that continues a branch it did not open', () => {
    expect(isTwigBalancedWithin([10, 25], blocks)).toBe(false);
  });

  it('accepts a range with no blocks', () => {
    expect(isTwigBalancedWithin([30, 40], blocks)).toBe(true);
  });
});
