import { parseForESLint } from 'twig-eslint-parser';
import { describe, expect, it } from 'vitest';
import { findUnsoundTagStarts, isOpenTagUnsound } from '../src/shared/unsound-open-tags.js';

const tagAt = (start: number) => ({ openStart: { range: [start, start + 2] as const, value: '<a' } });

function unsoundTagStartsIn(code: string): ReadonlySet<number> {
  return findUnsoundTagStarts(parseForESLint(code).services.twig.diagnostics);
}

describe('findUnsoundTagStarts', () => {
  it('is empty for a tag that ends with > and holds only attributes', () => {
    expect(unsoundTagStartsIn('<a href="x">y</a>').size).toBe(0);
  });

  it('holds the start of an open tag with no closing bracket', () => {
    expect([...unsoundTagStartsIn('<p>x</p><a href="x"')]).toEqual([8]);
  });

  it('holds the start of a tag with an unquoted value that runs into the next tag', () => {
    expect([...unsoundTagStartsIn('<p>x</p><li id=b<span>x</span></li>')]).toEqual([8]);
  });

  it('holds the start of a tag whose quotes are mangled, so an attribute name holds a quote', () => {
    expect([...unsoundTagStartsIn('<p>x</p><li class="a\' data-x="y" id="z">x</li>')]).toEqual([8]);
  });

  it('ignores problems that do not misread an open tag', () => {
    expect(unsoundTagStartsIn('<p>x</p></div>').size).toBe(0);
  });

  it('ignores a < inside a quoted value or a Twig block', () => {
    expect(unsoundTagStartsIn('<a title="a<b" {{ x < y }}>y</a>').size).toBe(0);
  });
});

describe('isOpenTagUnsound', () => {
  it('matches a tag by where its open tag starts', () => {
    const starts = new Set([8]);
    expect(isOpenTagUnsound(tagAt(8), starts)).toBe(true);
    expect(isOpenTagUnsound(tagAt(0), starts)).toBe(false);
  });
});
