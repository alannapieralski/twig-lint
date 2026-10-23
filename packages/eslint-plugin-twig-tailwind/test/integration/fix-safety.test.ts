import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import { parseForESLint } from 'twig-eslint-parser';
import { describe, expect, it } from 'vitest';
import { createConfig } from '../../src/index.js';

const fixturesDirectory = fileURLToPath(new URL('../fixtures/', import.meta.url));
const parserFixturesDirectory = new URL('../../../twig-eslint-parser/test/fixtures/twig/', import.meta.url);
const parserFixtures = readdirSync(parserFixturesDirectory).filter((name) => name.endsWith('.twig')).sort();

const ruleOptions: Record<string, unknown[]> = {
  'no-restricted-classes': [{ restrict: [{ pattern: '^flex-grow$', fix: 'grow' }] }],
};
const everyBetterTailwindcssRule: Linter.RulesRecord = Object.fromEntries(
  Object.keys(betterTailwindcss.rules).map((rule) => [`better-tailwindcss/${rule}`, ['warn', ...(ruleOptions[rule] ?? [])]]),
);

function fixWith(rules: Linter.RulesRecord) {
  return new ESLint({
    cwd: fixturesDirectory,
    fix: true,
    overrideConfigFile: true,
    overrideConfig: [
      createConfig(),
      { files: ['**/*.twig'], settings: { 'better-tailwindcss': { entryPoint: 'tailwind/theme.css' } }, rules },
    ],
  });
}

function diagnosticCount(code: string): number {
  return parseForESLint(code).services.twig.diagnostics.length;
}

describe.each([
  ['the recommended config', {}],
  ['every better-tailwindcss rule', everyBetterTailwindcssRule],
])('--fix with %s', (_, rules) => {
  it.each(parserFixtures)('keeps %s valid Twig', async (fixtureName) => {
    const code = readFileSync(new URL(fixtureName, parserFixturesDirectory), 'utf8');
    const [result] = await fixWith(rules).lintText(code, { filePath: `${fixturesDirectory}/${fixtureName}` });
    const output = result?.output ?? code;
    expect(result?.messages.filter((message) => message.fatal)).toEqual([]);
    expect(() => parseForESLint(output)).not.toThrow();
    expect(diagnosticCount(output)).toBe(diagnosticCount(code));
    expect(output.split('`').length).toBe(code.split('`').length);
  });

  it.each([
    "{% set classes = ['card card-' ~ variant ~ ' card-' ~ size] %}",
    "<div{{ attributes.addClass('flex ' ~ modifier) }}></div>",
    "{% set classes = [prefix ~ ' flex'] %}",
  ])('keeps the spaces that separate classes in %s', async (code) => {
    const [result] = await fixWith(rules).lintText(code, { filePath: `${fixturesDirectory}/template.html.twig` });
    expect(result?.output ?? code).toBe(code);
  });
});
