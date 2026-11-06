import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import twigParser from '../../src/index.js';

async function lint(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{ files: ['**/*.twig'], languageOptions: { parser: twigParser } }],
  });
  const [result] = await eslint.lintText(code, { filePath: 'template.html.twig' });
  if (!result) {
    throw new Error('ESLint returned no result.');
  }
  return result;
}

describe('twig-eslint-parser inside ESLint', () => {
  it('does not crash on Drupal docblock comments that contain {{ }}', async () => {
    const result = await lint('{# Use {{ content }} to print everything. #}<p class="flex">x</p>');
    expect(result.messages).toEqual([]);
  });

  it('reports invalid Twig as a positioned parsing error', async () => {
    const result = await lint('<p>{{ foo </p>');
    expect(result.messages.map((message) => [message.fatal, message.message])).toEqual([[true, 'Parsing error: Unclosed variable opened at {1:4}.']]);
  });

  it.each(['<div class="a"\n  <p>x</p>\n</div>', '<div{{ attributes }} <p>x</p></div>'])('reads past broken markup in %j instead of failing the file', async (code) => {
    const result = await lint(code);
    expect(result.messages).toEqual([]);
  });
});
