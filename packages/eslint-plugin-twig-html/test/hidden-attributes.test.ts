import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import twigHtml from '../src/index.js';

const hideInterpolatedClasses: Linter.Config = { files: ['**/*.twig'], languageOptions: { parserOptions: { ignoreInterpolatedAttributes: ['class'] } } };

const everyRuleOff: Linter.RulesRecord = {
  'twig-html/attrs-newline': 'off',
  'twig-html/indent': 'off',
  'twig-html/multiline-html-element-content-newline': 'off',
  'twig-html/no-parse-errors': 'off',
  'twig-html/quotes': 'off',
};

async function lint(code: string, ruleId: string, fix = true) {
  const rules = { ...everyRuleOff, [ruleId]: 'warn' as const };
  const eslint = new ESLint({ overrideConfigFile: true, fix, overrideConfig: [twigHtml.configs.recommended, hideInterpolatedClasses, { files: ['**/*.twig'], rules }] });
  const [result] = await eslint.lintText(code, { filePath: 'template.html.twig' });
  if (!result) throw new Error('ESLint returned no result.');
  return { output: result.output ?? code, messages: result.messages };
}

describe('class attributes left out of the tree by ignoreInterpolatedAttributes', () => {
  describe('twig-html/attrs-newline', () => {
    it('accepts a tag whose attributes, the left-out class included, are each on their own line', async () => {
      const code = '<div\n  id="a"\n  class="card {{ modifier }}"\n  data-x="b"\n>\n  x\n</div>\n';
      expect((await lint(code, 'twig-html/attrs-newline')).messages).toEqual([]);
    });

    it('counts the left-out class, so two attributes on one line are reported and fixed', async () => {
      const { output } = await lint('<div class="card {{ modifier }}" id="a">x</div>', 'twig-html/attrs-newline');
      expect(output).toBe('<div\nclass="card {{ modifier }}"\nid="a"\n>x</div>');
    });

    it('keeps a left-out class in its place among the other attributes', async () => {
      const { output } = await lint('<a href="/" class="a {{ b }}" id="c">x</a>', 'twig-html/attrs-newline');
      expect(output).toBe('<a\nhref="/"\nclass="a {{ b }}"\nid="c"\n>x</a>');
    });
  });

  describe('twig-html/indent', () => {
    it('leaves the inside of a left-out class value that spans lines alone', async () => {
      const code = '<div\n  id="a"\n  class="card {{ modifier }}\n         card--wide"\n>\n  x\n</div>\n';
      expect((await lint(code, 'twig-html/indent', false)).messages).toEqual([]);
    });
  });

  describe('twig-html/multiline-html-element-content-newline', () => {
    it('does not fix content after an open tag whose left-out class swallowed markup', async () => {
      const code = '<div class=a{{ b }}<p\n  id="c">x</div>';
      const { output } = await lint(code, 'twig-html/multiline-html-element-content-newline');
      expect(output).toBe(code);
    });
  });

  describe('twig-html/quotes', () => {
    it('checks a left-out class inside a nested tag', async () => {
      const { output } = await lint("<ul><li class='a {% if b %}c{% endif %}'>x</li></ul>", 'twig-html/quotes');
      expect(output).toBe('<ul><li class="a {% if b %}c{% endif %}">x</li></ul>');
    });
  });
});
