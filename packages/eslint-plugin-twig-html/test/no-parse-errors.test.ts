import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import twigHtml from '../src/index.js';

const otherRules: Linter.RulesRecord = {
  'twig-html/attrs-newline': 'off',
  'twig-html/indent': 'off',
  'twig-html/multiline-html-element-content-newline': 'off',
  'twig-html/quotes': 'off',
};

async function lint(code: string, ruleOptions?: Record<string, boolean>) {
  const rules: Linter.RulesRecord = { ...otherRules, ...(ruleOptions && { 'twig-html/no-parse-errors': ['warn', ruleOptions] }) };
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [twigHtml.configs.recommended, { files: ['**/*.twig'], rules }] });
  const [result] = await eslint.lintText(code, { filePath: 'template.html.twig' });
  if (!result) throw new Error('ESLint returned no result.');
  return result.messages;
}

describe('twig-html/no-parse-errors', () => {
  it('is on as a warning in the recommended config', () => {
    expect(twigHtml.configs.recommended.rules?.['twig-html/no-parse-errors']).toBe('warn');
  });

  it.each([
    ['<div class="a"', 'eof-in-tag', 1],
    ['<li id=b<span>x</span></li>', 'unexpected-character-in-unquoted-attribute-value', 1],
    ['<p>x</p>\n</div>', 'x-invalid-end-tag', 2],
    ['<div>\n<p>x</p>', 'x-unclosed-element', 1],
    ['{% block a %}\n{% else %}\n{% endblock %}', 'x-misplaced-twig-tag', 2],
    ['<p>{{ title subtitle }}</p>', 'x-unparsed-twig', 1],
  ])('reports %j as %s on line %i', async (code, diagnosticCode, line) => {
    const messages = await lint(code);
    expect(messages[0]).toMatchObject({ ruleId: 'twig-html/no-parse-errors', line });
    expect(messages[0]?.message).toContain(`(${diagnosticCode})`);
  });

  it('stays quiet for a sound template', async () => {
    expect(await lint('<div class="a">{% if b %}<p>{{ c }}</p>{% endif %}</div>')).toEqual([]);
  });

  it('reports every problem in the file', async () => {
    expect(await lint('<div>\n<p>{{ a b }}</p>\n</span>')).toHaveLength(3);
  });

  it('turns one code off and keeps the others', async () => {
    const messages = await lint('<div>\n</span>', { 'x-unclosed-element': false });
    expect(messages.map((message) => message.message)).toEqual([expect.stringContaining('(x-invalid-end-tag)')]);
  });

  it('reports the thrown error instead when the Twig is fatally broken', async () => {
    const messages = await lint('<p>{{ a </p>');
    expect(messages).toMatchObject([{ fatal: true, message: expect.stringContaining('Unclosed variable') }]);
  });

  it('rejects an option that is not a diagnostic code', async () => {
    await expect(lint('<p></p>', { 'not-a-code': true })).rejects.toThrow();
  });
});
