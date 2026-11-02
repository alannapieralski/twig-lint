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

  it.each([
    ['<div class="a"\n  <p>x</p>\n</div>', 2, 3],
    ['<div{{ attributes }} <p>x</p></div>', 1, 22],
  ])('reports broken markup in %j as a parsing error at its position in the template', async (code, expectedLine, expectedColumn) => {
    const result = await lint(code);
    expect(result.messages.map(({ fatal, message, line, column }) => ({ fatal, message, line, column }))).toEqual([
      { fatal: true, message: "Parsing error: Unexpected end of tag. Expected '>' to close the opening tag.", line: expectedLine, column: expectedColumn },
    ]);
  });
});
