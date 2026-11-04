import { describe, expect, it } from 'vitest';
import { isOpenTagUnreadable } from '../src/shared/unreadable-open-tags.js';

const tagAt = (start: number) => ({ openStart: { range: [start, start + 2] as const, value: '<a' } });

describe('isOpenTagUnreadable', () => {
  it('matches a tag by where its open tag starts', () => {
    const starts = new Set([8]);
    expect(isOpenTagUnreadable(tagAt(8), starts)).toBe(true);
    expect(isOpenTagUnreadable(tagAt(0), starts)).toBe(false);
  });
});
