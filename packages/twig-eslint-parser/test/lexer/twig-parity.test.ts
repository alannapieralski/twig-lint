import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findParityMismatches  } from './parity.js';
import type {Golden} from './parity.js';

const fixturesDirectory = new URL('../fixtures/twig/', import.meta.url);

const pendingPatchesByFixture: Record<string, string[]> = {
};

const showPendingMismatches = process.env['PARITY_SHOW_PENDING'] === '1';

const fixtureNames = readdirSync(fixturesDirectory).filter((name) => name.endsWith('.twig')).sort();

function assertParity(fixtureName: string): void {
  const source = readFileSync(new URL(fixtureName, fixturesDirectory), 'utf8');
  const golden = JSON.parse(readFileSync(new URL(fixtureName.replace(/\.twig$/, '.tokens.json'), fixturesDirectory), 'utf8')) as Golden;
  expect(findParityMismatches(source, golden).join('\n')).toBe('');
}

describe('lexer parity with Twig (golden files from tools/twig-oracle)', () => {
  for (const fixtureName of fixtureNames) {
    const pendingPatches = pendingPatchesByFixture[fixtureName];
    if (pendingPatches && !showPendingMismatches) {
      it.fails(`${fixtureName} (awaiting ${pendingPatches.join(', ')})`, () => assertParity(fixtureName));
    } else {
      it(fixtureName, () => assertParity(fixtureName));
    }
  }
});

const expression = {
  source: '{{ "\\x41\\101" ~ \'it\\\'s\' is null }}\n',
  golden: {
    twig: '3.30.0',
    tokens: [
      { type: 'begin of print statement', value: '', line: 1, offset: 0 },
      { type: 'string', value: 'AA', line: 1, offset: 3 },
      { type: 'operator', value: '~', line: 1, offset: 14, end: 15 },
      { type: 'string', value: 'it\'s', line: 1, offset: 16 },
      { type: 'operator', value: 'is', line: 1, offset: 24, end: 26 },
      { type: 'name', value: 'null', line: 1, offset: 27, end: 31 },
      { type: 'end of print statement', value: '', line: 1, offset: 32 },
      { type: 'text', value: '\n', line: 1, offset: 34 },
      { type: 'end of template', value: '', line: 2, offset: 35 },
    ],
  },
};

function withTwigToken(golden: Golden, index: number, changes: Partial<Golden['tokens'][number]>): Golden {
  return { ...golden, tokens: golden.tokens.map((token, tokenIndex) => (tokenIndex === index ? { ...token, ...changes } : token)) };
}

describe('the parity comparison', () => {
  it('decodes string escapes the way Twig does', () => {
    expect(findParityMismatches(expression.source, expression.golden)).toEqual([]);
  });

  it('reports a string whose value differs from Twig\'s', () => {
    expect(findParityMismatches(expression.source, withTwigToken(expression.golden, 3, { value: 'it\\\'s' }))).toEqual([
      'our value is "it\'s": Twig string "it\\\\\'s" at line 1, offset 16',
    ]);
  });

  it('reports a test operator that Twig and our lexer type differently', () => {
    expect(findParityMismatches(expression.source, withTwigToken(expression.golden, 4, { type: 'name' }))).toEqual([
      'our token is TEST_OPERATOR "is", expected NAME: Twig name "is" at line 1, offset 24',
    ]);
  });

  it('reports a token that ends somewhere other than where Twig\'s ends', () => {
    expect(findParityMismatches(expression.source, withTwigToken(expression.golden, 5, { end: 30 }))).toEqual([
      'our token ends at 31, Twig\'s at 30: Twig name "null" at line 1, offset 27',
    ]);
  });

  it('reports a token on a different line from Twig\'s', () => {
    expect(findParityMismatches(expression.source, withTwigToken(expression.golden, 5, { line: 2 }))).toEqual([
      'our line is 1: Twig name "null" at line 2, offset 27',
    ]);
  });

  it('reports Twig text that our lexer puts inside a comment', () => {
    const golden: Golden = {
      twig: '3.30.0',
      tokens: [
        { type: 'text', value: '{# a #}x', line: 1, offset: 0 },
        { type: 'end of template', value: '', line: 1, offset: 8 },
      ],
    };
    expect(findParityMismatches('{# a #}x', golden)).toEqual([
      'our COMMENT_START "{#" at offset 0 is inside our comment, but Twig has text there: Twig text "{# a #}x" at line 1, offset 0',
    ]);
  });

  it('reports our text that Twig does not have', () => {
    const golden: Golden = { twig: '3.30.0', tokens: [{ type: 'end of template', value: '', line: 1, offset: 8 }] };
    expect(findParityMismatches('{# a #}x', golden)).toEqual(['our TEXT "x" at offset 7 is not text in Twig']);
  });
});
