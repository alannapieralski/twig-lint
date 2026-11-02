import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { containsGroupDelimiter } from '../src/processors/class-groups.js';
import { createConfig } from '../src/index.js';

describe('containsGroupDelimiter', () => {
  it.each([
    ['"a [ md:b ]"', true],
    ["'a | b'", true],
    ['a b', false],
    ['"[&_img]:w-auto md:[mask:none]"', false],
  ])('%s → %s', (classList, expected) => {
    expect(containsGroupDelimiter(classList)).toBe(expected);
  });
});

describe('the recommended config on class lists with [ ] and | groups', () => {
  const fixturesDirectory = fileURLToPath(new URL('./fixtures/', import.meta.url));

  async function lint(code: string, fix: boolean) {
    const eslint = new ESLint({
      cwd: fixturesDirectory,
      fix,
      overrideConfigFile: true,
      overrideConfig: [createConfig(), { files: ['**/*.twig'], settings: { 'better-tailwindcss': { entryPoint: 'tailwind/theme.css' } } }],
    });
    const [result] = await eslint.lintText(code, { filePath: 'template.html.twig' });
    if (!result) {
      throw new Error('ESLint returned no result.');
    }
    return result;
  }

  it('leaves the order, wrapping and delimiters of a grouped class list alone', async () => {
    const code = '<div class="o-section | flex-col flex [ md:gap-8 md:flex-row ] [ lg:gap-12 ] [ xl:gap-16 ] [ 2xl:gap-20 ]">x</div>';
    const result = await lint(code, true);
    expect(result.output ?? code).toBe(code);
    expect(result.messages.map((message) => message.ruleId)).not.toContain('better-tailwindcss/enforce-consistent-class-order');
  });

  it('reports no delimiter as a duplicate or unknown class', async () => {
    const result = await lint("{% set classes = ['flex [ md:p-2 ] [ lg:p-4 ]'] %}", false);
    expect(result.messages.map((message) => message.message).filter((text) => /"[[\]|]"|: [[\]|]$/.test(text))).toEqual([]);
  });

  it('still fixes a single class inside a grouped list', async () => {
    const result = await lint('<div class="flex [ md:flex-grow ]">x</div>', true);
    expect(result.output).toBe('<div class="flex [ md:grow ]">x</div>');
  });

  it('still sorts a class list without delimiters', async () => {
    const result = await lint('<div class="flex-col flex">x</div>', true);
    expect(result.output).toBe('<div class="flex flex-col">x</div>');
  });
});
