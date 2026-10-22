import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import twigHtml from '../src/index.js';

async function lint(code: string, ruleOptions?: Record<string, unknown>, fix = true, indentRule: Linter.RuleEntry = 'warn') {
  const rules: Linter.RulesRecord = {
    'twig-html/attrs-newline': 'off',
    'twig-html/indent': indentRule,
    'twig-html/quotes': 'off',
    'twig-html/multiline-html-element-content-newline': ruleOptions ? ['warn', ruleOptions] : 'warn',
  };
  const eslint = new ESLint({ overrideConfigFile: true, fix, overrideConfig: [twigHtml.configs.recommended, { files: ['**/*.twig'], rules }] });
  const [result] = await eslint.lintText(code, { filePath: 'template.html.twig' });
  if (!result) throw new Error('ESLint returned no result.');
  return { output: result.output ?? code, messages: result.messages };
}

async function fixed(code: string, ruleOptions?: Record<string, unknown>): Promise<string> {
  return (await lint(code, ruleOptions)).output;
}

async function fixedAlone(code: string, ruleOptions?: Record<string, unknown>): Promise<string> {
  return (await lint(code, ruleOptions, true, 'off')).output;
}

describe('twig-html/multiline-html-element-content-newline', () => {
  it('moves text onto its own line when the opening tag spans several lines', async () => {
    expect(await fixed('<h2\n  id="system-breadcrumb"\n  class="sr-only"\n>You are here:</h2>')).toBe(
      '<h2\n  id="system-breadcrumb"\n  class="sr-only"\n>\n  You are here:\n</h2>',
    );
  });

  it('moves a title\'s text onto its own line, since browsers trim it', async () => {
    expect(await fixed('<title\n  id="t"\n  class=""\n>{{ head_title }}</title>')).toBe('<title\n  id="t"\n  class=""\n>\n  {{ head_title }}\n</title>');
  });

  it('leaves an empty tag as >< when its opening tag spans several lines', async () => {
    const code = '<div\n  class="swiper-pagination"\n  data-js-gallery-pagination\n></div>';
    expect((await lint(code)).messages).toEqual([]);
  });

  it('accepts a tag with whitespace-only content on one line break', async () => {
    const code = '<div\n  class="a"\n  id="b"\n>\n</div>';
    expect((await lint(code)).messages).toEqual([]);
  });

  it('reduces whitespace-only content to one line break', async () => {
    expect(await fixed('<div\n  class="a"\n  id="b"\n>\n\n</div>')).toBe('<div\n  class="a"\n  id="b"\n>\n</div>');
    expect(await fixedAlone('  <div\n    class="a"\n  >\n\n  </div>')).toBe('  <div\n    class="a"\n  >\n  </div>');
  });

  it('breaks an empty tag when ignoreWhenEmpty is off', async () => {
    expect(await fixed('<div\n  class="a"\n></div>', { ignoreWhenEmpty: false })).toBe('<div\n  class="a"\n>\n</div>');
  });

  it('leaves an element on one line alone, whatever it contains', async () => {
    const code = '<h2 id="a" class="b">text</h2>\n<div class="a"><p>x</p></div>';
    expect((await lint(code)).messages).toEqual([]);
  });

  it('lays out an element whose content spans several lines, even when its opening tag is on one line', async () => {
    expect(await fixed('<p>Some\n  text</p>')).toBe('<p>\n  Some\n  text\n</p>');
  });

  it('removes blank lines around the content, keeping its indentation', async () => {
    expect(await fixedAlone('<div class="a">\n\n    text\n\n</div>')).toBe('<div class="a">\n    text\n</div>');
  });

  it('allows blank lines around the content when allowEmptyLines is on', async () => {
    const code = '<div class="a">\n\n  text\n\n</div>';
    expect((await lint(code, { allowEmptyLines: true })).messages).toEqual([]);
    expect(await fixed('<div\n  class="a"\n>text</div>', { allowEmptyLines: true })).toBe('<div\n  class="a"\n>\n  text\n</div>');
  });

  it('reports how many line breaks it found on each side', async () => {
    const { messages } = await lint('<p\n  class="a"\n>text</p>', undefined, false);
    expect(messages.map((message) => message.message)).toEqual([
      'Expected 1 line break after opening tag (`<p>`), but no line breaks found.',
      'Expected 1 line break before closing tag (`</p>`), but no line breaks found.',
    ]);
  });

  it('moves child elements and Twig onto their own lines', async () => {
    expect(await fixed('<ul\n  class="a"\n  id="b"\n><li>{{ item }}</li></ul>')).toBe('<ul\n  class="a"\n  id="b"\n>\n  <li>{{ item }}</li>\n</ul>');
    expect(await fixed('<p\n  class="a"\n  id="b"\n>{{ text }}</p>')).toBe('<p\n  class="a"\n  id="b"\n>\n  {{ text }}\n</p>');
  });

  it('breaks only the side that is wrong', async () => {
    expect(await fixed('<p\n  class="a"\n  id="b"\n>\n  text</p>')).toBe('<p\n  class="a"\n  id="b"\n>\n  text\n</p>');
    expect(await fixed('<p\n  class="a"\n  id="b"\n>text\n</p>')).toBe('<p\n  class="a"\n  id="b"\n>\n  text\n</p>');
  });

  it('accepts a tag that is already laid out correctly, whatever the indentation of its content', async () => {
    expect((await lint('  <p\n    class="a"\n    id="b"\n  >\n    text\n  </p>')).messages).toEqual([]);
    expect((await lint('<p\n  class="a"\n  id="b"\n>\n      text\n</p>')).messages).toEqual([]);
  });

  it('starts each new line at the indentation of the tag line, leaving the step to twig-html/indent', async () => {
    const code = '{% if x %}\n    <p\n      class="a"\n      id="b"\n    >{{ text }}</p>\n{% endif %}';
    expect(await fixedAlone(code)).toBe('{% if x %}\n    <p\n      class="a"\n      id="b"\n    >\n    {{ text }}\n    </p>\n{% endif %}');
    expect(await fixed(code)).toBe('{% if x %}\n  <p\n    class="a"\n    id="b"\n  >\n    {{ text }}\n  </p>\n{% endif %}');
  });

  it('works with attrs-newline: one pass lays out the attributes, the next the content', async () => {
    const eslint = new ESLint({ overrideConfigFile: true, fix: true, overrideConfig: [twigHtml.configs.recommended] });
    const [result] = await eslint.lintText('<h2 id="a" class="b">You are here:</h2>', { filePath: 'template.html.twig' });
    expect(result?.output).toBe('<h2\n  id="a"\n  class="b"\n>\n  You are here:\n</h2>');
  });

  it('only nests the first line break for a tag with a single attribute that is already multi-line', async () => {
    expect(await fixed('<h2\n  id="a">x</h2>')).toBe('<h2\n  id="a">\n  x\n</h2>');
  });

  it('keeps Windows line endings', async () => {
    expect(await fixed('<p\r\n  class="a"\r\n  id="b"\r\n>text</p>')).toBe('<p\r\n  class="a"\r\n  id="b"\r\n>\r\n  text\r\n</p>');
  });

  it.each(['pre', 'textarea'])('never touches <%s>, where whitespace is content, even when ignores leaves it out', async (name) => {
    const code = `<${name}\n  class="a"\n  id="b"\n>text</${name}>`;
    expect((await lint(code)).messages).toEqual([]);
    expect((await lint(code, { ignores: ['span'] })).messages).toEqual([]);
  });

  it.each(['a', 'span', 'strong', 'label', 'ruby', 'video'])('ignores the inline element <%s> by default', async (name) => {
    const code = `<${name}\n  class="a"\n  id="b"\n>this</${name}>`;
    expect((await lint(code)).messages).toEqual([]);
  });

  it('reports an inline element taken out of ignores, but does not fix it', async () => {
    const code = '<span\n  class="a"\n>this</span>';
    const result = await lint(code, { ignores: [] });
    expect(result.output).toBe(code);
    expect(result.messages).toHaveLength(2);
  });

  it('never touches a tag inside an ignored element', async () => {
    const code = '<a\n  href="/x"\n><div\n  class="a"\n>text</div></a>';
    expect((await lint(code)).messages).toEqual([]);
  });

  it('never touches a tag inside <pre>, where whitespace is content', async () => {
    const code = '<pre><div\n  class="a"\n  id="b"\n>text</div></pre>';
    expect((await lint(code)).messages).toEqual([]);
  });

  it.each(['my-element', 'unknown', 'h{{ level }}'])('reports <%s>, which is not ignored by default, but does not fix it, since a line break inside it may render as a space', async (name) => {
    const code = `<${name}\n  class="a"\n>new</${name}>`;
    const result = await lint(code);
    expect(result.output).toBe(code);
    expect(result.messages.map((message) => message.messageId)).toEqual(['unexpectedAfterClosingBracket', 'unexpectedBeforeOpeningBracket']);
  });

  it('lays out <button>, which drops whitespace at the edges of its content', async () => {
    expect(await fixed('<button\n  type="button"\n>Go</button>')).toBe('<button\n  type="button"\n>\n  Go\n</button>');
  });

  it.each([
    ['a wrapper opened and closed in separate conditions', '{% if wrap %}<div class="wrapper">{% endif %}\n  {{ content }}\n{% if wrap %}</div>{% endif %}'],
    ['an element whose content ends in another branch', '<div class="a">{% if x %}\n  a\n{% else %}\n  b</div>{% endif %}'],
    ['an element whose content opens a block it does not close', '<div class="a">\n  {% for item in items %}<p>{{ item }}</p></div>{% endfor %}'],
  ])('never touches %s, since its edges belong to Twig branches', async (_name, code) => {
    const result = await lint(code);
    expect(result.output).toBe(code);
    expect(result.messages).toEqual([]);
  });

  it('still lays out an element whose Twig blocks open and close inside it', async () => {
    expect(await fixedAlone('<div class="a">{% if x %}\n  a\n{% else %}\n  b\n{% endif %}</div>')).toBe('<div class="a">\n{% if x %}\n  a\n{% else %}\n  b\n{% endif %}\n</div>');
  });

  it.each([
    ['a short block', "<h1>{% block title 'Home' %}\n</h1>\n{% block body %}{% endblock %}\n"],
    ['Drupal\'s short trans', "<p>{% trans 'Hello' %}\n</p>\n{% trans %}Bye{% endtrans %}\n"],
  ])('lays out an element holding %s even when the file also has the long form', async (_name, code) => {
    expect(await fixedAlone(code)).toBe(code.replace(/^<(h1|p)>/, '<$1>\n'));
  });

  it.each(['{{ element }}'])('never touches <%s>, whose name Twig may render as an inline element', async (name) => {
    const code = `<${name}\n  class="a"\n  id="b"\n>this</${name}>`;
    expect((await lint(code)).messages).toEqual([]);
  });

  it('keeps non-breaking spaces at the edges of the content', async () => {
    expect(await fixed('<p\n  class="a"\n  id="b"\n>\u00A0text\u00A0</p>')).toBe('<p\n  class="a"\n  id="b"\n>\n  \u00A0text\u00A0\n</p>');
  });

  it('leaves <script> and <style> alone', async () => {
    expect((await lint('<script\n  src="a"\n  type="module"\n>init()</script>')).messages).toEqual([]);
    expect((await lint('<style\n  media="print"\n  id="b"\n>a { color: red; }</style>')).messages).toEqual([]);
  });

  it('leaves inline SVG alone, and lays it out once svg is taken out of ignores', async () => {
    const code = '<svg\n  class="icon"\n  viewBox="0 0 1 1"\n><path d="M0 0"/></svg>';
    expect(await fixed(code)).toBe(code);
    expect(await fixed(code, { ignores: ['pre', 'textarea'] })).toBe('<svg\n  class="icon"\n  viewBox="0 0 1 1"\n>\n  <path d="M0 0"/>\n</svg>');
  });

  it('keeps content it moves at the tag line indentation where twig-html/indent cannot know the depth', async () => {
    const code = '<head>\n  <p>\n  <div\n    class="a"\n    id="b"\n  >{# note #}\n  </div>\n</head>';
    expect(await fixed(code)).toBe('<head>\n  <p>\n  <div\n    class="a"\n    id="b"\n  >\n  {# note #}\n  </div>\n</head>');
  });

  it('moves child tags onto their own lines, and twig-html/indent indents them', async () => {
    const code = '<div\n  class="a"\n  id="b"\n><p\n  class="c"\n  id="d"\n>text</p></div>';
    expect(await fixedAlone(code)).toBe('<div\n  class="a"\n  id="b"\n>\n<p\n  class="c"\n  id="d"\n>\ntext\n</p>\n</div>');
    expect(await fixed(code)).toBe('<div\n  class="a"\n  id="b"\n>\n  <p\n    class="c"\n    id="d"\n  >\n    text\n  </p>\n</div>');
  });

  it('does not report tags without a closing tag, such as void elements', async () => {
    expect((await lint('<img\n  src="a"\n  alt=""\n>')).messages).toEqual([]);
  });

  it.each([
    ['an open tag missing its >', '<li\n  class="a"\n  id="b"{{ title }}</li>'],
    ['an open tag missing its > before plain text', '<li\n  class="a"\n  id="b"text</li>'],
    ['an open tag whose unquoted value swallowed the next tag', '<li\n  class="a"\n  id=b<span>x</span></li>'],
    ['an open tag with no > before the end of the file', '<li\n  class="a"\n  id="b"\n'],
  ])('does not report %s, so the markup it swallowed is never split', async (_name, code) => {
    const result = await lint(code);
    expect(result.output).toBe(code);
    expect(result.messages.filter((message) => message.ruleId === 'twig-html/multiline-html-element-content-newline')).toEqual([]);
  });
});
