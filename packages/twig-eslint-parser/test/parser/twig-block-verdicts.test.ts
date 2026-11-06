import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareBlockVerdictsWithTwig } from '../support/block-verdicts.js';
import type { TwigBlockVerdict } from '../support/block-verdicts.js';

const fixturesDirectory = new URL('../fixtures/twig/', import.meta.url);
const fixtureNames = readdirSync(fixturesDirectory).filter((name) => name.endsWith('.twig')).sort();

function readTwigVerdicts(fixtureName: string): TwigBlockVerdict[] {
  const golden = JSON.parse(readFileSync(new URL(fixtureName.replace(/\.twig$/, '.blocks.json'), fixturesDirectory), 'utf8')) as { blocks: TwigBlockVerdict[] };
  return golden.blocks;
}

describe('block verdicts match Twig (golden files from tools/twig-oracle/parse.php)', () => {
  it.each(fixtureNames)('%s rejects exactly the blocks Twig rejects', (fixtureName) => {
    const code = readFileSync(new URL(fixtureName, fixturesDirectory), 'utf8');
    const { disagreements } = compareBlockVerdictsWithTwig(code, readTwigVerdicts(fixtureName));
    expect(disagreements.map((disagreement) => disagreement.description)).toEqual([]);
  });
});
