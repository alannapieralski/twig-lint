import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import twigHtml from '../src/index.js';

async function lint(code: string, ruleOptions?: Record<string, unknown>, indentRule: Linter.RuleEntry = 'warn') {
  const rules: Linter.RulesRecord = {
    'twig-html/indent': indentRule,
    'twig-html/multiline-html-element-content-newline': 'off',
    'twig-html/no-parse-errors': 'off',
    'twig-html/quotes': 'off',
    ...(ruleOptions && { 'twig-html/attrs-newline': ['warn', ruleOptions] }),
  };
  const eslint = new ESLint({ overrideConfigFile: true, fix: true, overrideConfig: [twigHtml.configs.recommended, { files: ['**/*.twig'], rules }] });
  const [result] = await eslint.lintText(code, { filePath: 'template.html.twig' });
  if (!result) throw new Error('ESLint returned no result.');
  return { output: result.output ?? code, messages: result.messages };
}

async function fixed(code: string, ruleOptions?: Record<string, unknown>): Promise<string> {
  return (await lint(code, ruleOptions)).output;
}

async function fixedAlone(code: string, ruleOptions?: Record<string, unknown>): Promise<string> {
  return (await lint(code, ruleOptions, 'off')).output;
}

describe('twig-html/attrs-newline', () => {
  it('puts each of three attributes on its own line, indented one step from the tag, with > back at the tag', async () => {
    expect(await fixed('<button type="button" class="flex" data-js-toggle>x</button>')).toBe(
      '<button\n  type="button"\n  class="flex"\n  data-js-toggle\n>x</button>',
    );
  });

  it('starts each new line at the indentation of the tag line, leaving the step to twig-html/indent', async () => {
    expect(await fixedAlone('  <button type="button" class="flex" data-js-toggle>x</button>')).toBe('  <button\n  type="button"\n  class="flex"\n  data-js-toggle\n  >x</button>');
  });

  it('lays out a tag after an element that is never closed, where twig-html/indent cannot know the depth', async () => {
    expect(await fixed('<head>\n  <p>\n  <link rel="a" href="b">\n</head>\n')).toBe(
      '<head>\n  <p>\n  <link\n    rel="a"\n    href="b"\n  >\n</head>\n',
    );
  });

  it('lays out a tag inside an element split across Twig branches', async () => {
    expect(await fixed('{% if url %}<a href="{{ url }}">{% endif %}\n  <span class="a" id="b">x</span>\n{% if url %}</a>{% endif %}\n')).toBe(
      '{% if url %}<a href="{{ url }}">{% endif %}\n  <span\n    class="a"\n    id="b"\n  >x</span>\n{% if url %}</a>{% endif %}\n',
    );
  });

  it('accepts attributes on their own lines at any indentation', async () => {
    expect((await lint('\t<a\n\t\t\thref="#"\n class="a"\n  id="b"\n>x</a>', undefined, 'off')).messages).toEqual([]);
  });

  it('leaves tags with one attribute alone', async () => {
    const code = '<a class="flex w-full items-center justify-center gap-4 overflow-hidden">x</a>';
    expect((await lint(code)).messages).toEqual([]);
  });

  it('lays out a tag with two attributes', async () => {
    expect(await fixed('<a href="{{ url }}" class="flex">x</a>')).toBe('<a\n  href="{{ url }}"\n  class="flex"\n>x</a>');
  });

  it('lays out a tag inside Twig blocks', async () => {
    const code = '{% for item in items %}\n    <li class="a" id="{{ item.id }}" role="listitem">{{ item }}</li>\n{% endfor %}';
    expect(await fixed(code)).toBe(
      '{% for item in items %}\n  <li\n    class="a"\n    id="{{ item.id }}"\n    role="listitem"\n  >{{ item }}</li>\n{% endfor %}',
    );
  });

  it.each([
    ["<nav{{ attributes|without('role') }} role=\"navigation\" aria-labelledby=\"a\">x</nav>", "<nav{{ attributes|without('role') }}\n  role=\"navigation\"\n  aria-labelledby=\"a\"\n>x</nav>"],
    ['<h{{ heading }} class="a" id="b">x</h1>', '<h{{ heading }}\n  class="a"\n  id="b"\n>x</h1>'],
    ['<div{% if id %} id="{{ id }}"{% endif %} class="a" role="b">x</div>', '<div{% if id %}\n    id="{{ id }}"{% endif %}\n  class="a"\n  role="b"\n>x</div>'],
    ['<legend{{ legend.attributes }} class="a" id="b">x</legend>', '<legend{{ legend.attributes }}\n  class="a"\n  id="b"\n>x</legend>'],
    ["<div{{ create_attribute({'id': 'a'}) }} class=\"b\" role=\"c\">x</div>", "<div{{ create_attribute({'id': 'a'}) }}\n  class=\"b\"\n  role=\"c\"\n>x</div>"],
  ])('keeps Twig printed straight after the tag name on the tag line, without counting it: %s', async (code, expected) => {
    expect(await fixed(code)).toBe(expected);
  });

  it('does not report Drupal attributes on their own', async () => {
    expect((await lint('<div{{ attributes }}>x</div>')).messages).toEqual([]);
  });

  it('treats Twig inside a tag name as part of the name, never as an attribute', async () => {
    expect((await lint('<h{{ level }} class="a">x</h{{ level }}>')).messages).toEqual([]);
    expect(await fixed('<h{{ level }} class="a" id="b" role="c">x</h{{ level }}>')).toBe('<h{{ level }}\n  class="a"\n  id="b"\n  role="c"\n>x</h{{ level }}>');
  });

  it('lays out tags whose whole name is Twig, keeping the name on the tag line', async () => {
    expect(await fixed('<{{ html_element }} class="a" id="b" role="c">x</{{ html_element }}>')).toBe(
      '<{{ html_element }}\n  class="a"\n  id="b"\n  role="c"\n>x</{{ html_element }}>',
    );
  });

  it('keeps a slash at the end of an unquoted last value in the value, as HTML reads it', async () => {
    expect(await fixed('<svg-icon name=close size=s/>')).toBe('<svg-icon\n  name=close\n  size=s/\n>');
  });

  it('puts /> of a self-closing tag on its own line', async () => {
    expect(await fixed('<img src="{{ src }}" alt="" loading="lazy" />')).toBe('<img\n  src="{{ src }}"\n  alt=""\n  loading="lazy"\n/>');
  });

  it('keeps a Twig block that spans several attributes together as one attribute', async () => {
    const code = '<input {% if checked %}checked disabled{% endif %} type="checkbox" name="a">';
    expect(await fixed(code)).toBe('<input\n  {% if checked %}checked disabled{% endif %}\n  type="checkbox"\n  name="a"\n>');
  });

  it('does not count a Twig block spanning attributes as more than one', async () => {
    expect((await lint('<input {% if checked %}checked disabled{% endif %}>')).messages).toEqual([]);
  });

  it('keeps multi-line attribute values as they are', async () => {
    const code = '<p class="a\n  b" id="c" role="d">x</p>';
    expect(await fixed(code)).toBe('<p\n  class="a\n  b"\n  id="c"\n  role="d"\n>x</p>');
  });

  it('moves the first attribute off the tag line, so aligned attributes end up indented', async () => {
    const code = '<button type="button"\n        class="flex"\n        data-js-toggle>x</button>';
    expect(await fixed(code)).toBe('<button\n  type="button"\n  class="flex"\n  data-js-toggle\n>x</button>');
  });

  it('accepts a tag that is already laid out correctly', async () => {
    expect((await lint('  <button\n    type="button"\n    class="flex"\n    data-js-toggle\n  >x</button>')).messages).toEqual([]);
  });

  it('leaves a tag alone when its > is inside one branch of a Twig block', async () => {
    const code = '<div class="a" id="b" {% if x %}data-x>{% else %}>{% endif %}\n</div>';
    expect(await lint(code)).toEqual({ output: code, messages: [] });
  });

  it('still lays out a tag whose Twig block opens and closes between its attributes', async () => {
    expect(await fixed('<div class="a" {% if x %}data-x{% else %}data-y{% endif %} id="b">x</div>')).toBe(
      '<div\n  class="a"\n  {% if x %}data-x{% else %}data-y{% endif %}\n  id="b"\n>x</div>',
    );
  });

  it('reports but does not fix a tag with a Twig comment between attributes, so the comment is never lost', async () => {
    const code = '<div class="a" {# note #} id="b" role="c">x</div>';
    const result = await lint(code);
    expect(result.output).toBe(code);
    expect(result.messages.map((message) => message.ruleId)).toEqual(['twig-html/attrs-newline']);
  });

  it.each([
    ['an open tag missing its >', '<li class="a" id="b"{{ title }}</li>'],
    ['an open tag missing its > before plain text', '<li class="a" id="b"text</li>'],
    ['an open tag whose unquoted value swallowed the next tag', '<li class="a" id=b<span>x</span></li>'],
  ])('reports but does not fix %s, so the markup it swallowed is never split', async (_name, code) => {
    const result = await lint(code);
    expect(result.output).toBe(code);
    expect(result.messages.map((message) => message.ruleId)).toEqual(['twig-html/attrs-newline']);
  });

  it.each([
    ['an open tag with no > before the end of the file', '<li class="a" id="b" data-x="c"'],
    ['an open tag with no > before the end of the file, after a closed tag', '<ul class="a" id="b" data-x="c">\n</ul>\n<li class="a" id="b" data-x="c"\n'],
  ])('does not crash on %s', async (_name, code) => {
    const result = await lint(code);
    expect(result.messages.filter((message) => message.fatal)).toEqual([]);
  });

  it('leaves <script> and <style> tags alone', async () => {
    const code = '<script src="a.js" type="module" defer></script><style media="print" id="a" data-x></style>';
    expect(await fixed(code)).toBe(code);
  });

  it('is not applied to .svg.twig templates by the recommended config', async () => {
    const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [twigHtml.configs.recommended] });
    const code = '<g id="a" fill="none" stroke="red"></g>';
    const [sprite] = await eslint.lintText(code, { filePath: 'sprite.svg.twig' });
    const [template] = await eslint.lintText(code, { filePath: 'template.html.twig' });
    expect(template?.messages.map((message) => message.ruleId)).toContain('twig-html/attrs-newline');
    expect(sprite?.messages.map((message) => message.ruleId)).not.toContain('twig-html/attrs-newline');
  });

  it('lints .svg.twig templates when the recommended config is reused for them', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        twigHtml.configs.recommended,
        { ...twigHtml.configs.recommended, files: ['**/*.svg.twig'], ignores: [], rules: { 'twig-html/attrs-newline': ['warn', { ignores: [] }] } },
      ],
    });
    const [sprite] = await eslint.lintText('<svg xmlns="a" viewBox="0 0 1 1" width="1"></svg>', { filePath: 'sprite.svg.twig' });
    expect(sprite?.messages.map((message) => message.ruleId)).toContain('twig-html/attrs-newline');
  });

  it('can keep > on the line of the last attribute', async () => {
    expect(await fixed('<a href="#" class="a" id="b">x</a>', { closeStyle: 'sameline' })).toBe('<a\n  href="#"\n  class="a"\n  id="b">x</a>');
    expect(await fixed('<img src="a" alt="" loading="lazy" />', { closeStyle: 'sameline' })).toBe('<img\n  src="a"\n  alt=""\n  loading="lazy" />');
  });

  it('can change the attribute threshold', async () => {
    expect((await lint('<a href="#" class="a" id="b">x</a>', { ifAttrsMoreThan: 3 })).messages).toEqual([]);
  });

  it('leaves tags inside an inline SVG alone', async () => {
    const code = '<div class="a" id="b"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M0 0" fill="none"/></svg></div>';
    expect(await fixed(code)).toBe('<div\n  class="a"\n  id="b"\n><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M0 0" fill="none"/></svg></div>');
  });

  it('can lay out inline SVG, or skip other elements', async () => {
    const svg = '<svg class="icon" viewBox="0 0 24 24"></svg>';
    expect(await fixed(svg, { ignores: [] })).toBe('<svg\n  class="icon"\n  viewBox="0 0 24 24"\n></svg>');
    const math = '<math display="block" class="a"></math>';
    expect(await fixed(math, { ignores: ['math'] })).toBe(math);
  });

  it('keeps Windows line endings when it breaks a tag', async () => {
    expect(await fixed('<div>\r\n  <a href="#" class="a">x</a>\r\n</div>')).toBe('<div>\r\n  <a\r\n    href="#"\r\n    class="a"\r\n  >x</a>\r\n</div>');
  });

  it('never touches markup inside textarea, which is text', async () => {
    const code = '<textarea name="a" rows="2"><p class="x" id="y">typed</p></textarea>';
    expect(await fixed(code)).toBe('<textarea\n  name="a"\n  rows="2"\n><p class="x" id="y">typed</p></textarea>');
  });

  it('breaks the opening tag of a title but never reads its text as markup', async () => {
    expect(await fixed('<title id="a" class="b" lang="en"><p class="x" id="y" lang="z"></title>')).toBe(
      '<title\n  id="a"\n  class="b"\n  lang="en"\n><p class="x" id="y" lang="z"></title>',
    );
  });
});

describe('twig-html/attrs-newline against the html-eslint attrs-newline cases', () => {
  const closeStyles = ['sameline', 'newline'] as const;
  const stripIndentation = (code: string) => code.replace(/\n[ \t]+/g, '\n');

  const valid: [string, Record<string, unknown>, string][] = [
    ['an element without attributes', { ifAttrsMoreThan: 0 }, '\n<p></p>'],
    ['a nested element without attributes', { ifAttrsMoreThan: 0 }, '\n<p>\n  <img />\n</p>'],
    ['one attribute per tag under the default threshold', { ifAttrsMoreThan: 1 }, '\n<p class="foo">\n  <img class="foo" />\n</p>'],
    ['multi-line values on a single attribute', { ifAttrsMoreThan: 1 }, '\n<p title="this\n  is\n  a\n  long\n  value">\n  <img class="this\n  is\n  a\n  long" />\n</p>'],
  ];

  describe.each(closeStyles)('closeStyle %s', (closeStyle) => {
    it.each(valid)('accepts %s', async (_name, options, code) => {
      expect((await lint(code, { closeStyle, ...options }, 'off')).messages).toEqual([]);
    });
  });

  const validBySameline: [string, Record<string, unknown>, string][] = [
    ['one attribute on its own line, with > after it', { ifAttrsMoreThan: 0 }, '\n<p\n  class="foo">\n  <img\n    class="foo" />\n</p>'],
    ['two attributes on their own lines, with > after them', { ifAttrsMoreThan: 1 }, '\n<p\n  class="foo"\n  id="p">\n  <img\n    class="foo"\n    id="img" />\n</p>'],
    ['a valueless attribute between others', { ifAttrsMoreThan: 1 }, '\n<p\n  class="foo"\n  data-newline\n  id="p">\n  <img\n    class="foo"\n    id="img" />\n</p>'],
    ['a multi-line value among attributes on their own lines', { ifAttrsMoreThan: 1 }, '\n<p\n  class="foo"\n  data-newline\n  id="p"\n  title="this\n  is\n  a\n  long\n  value">\n  <img\n    class="foo"\n    id="img" />\n</p>'],
  ];

  it.each(validBySameline)('accepts %s with closeStyle sameline', async (_name, options, code) => {
    expect((await lint(code, { closeStyle: 'sameline', ...options }, 'off')).messages).toEqual([]);
  });

  const validByNewline: [string, Record<string, unknown>, string][] = [
    ['one attribute on its own line, with > on its own line', { ifAttrsMoreThan: 0 }, '\n<p\n  class="foo"\n  >\n  <img\n    class="foo"\n  />\n</p>'],
    ['two attributes on their own lines, with > on its own line', { ifAttrsMoreThan: 1 }, '\n<p\n  class="foo"\n  id="p"\n  >\n  <img\n    class="foo"\n    id="img"\n  />\n</p>'],
    ['a valueless attribute between others', { ifAttrsMoreThan: 1 }, '\n<p\n  class="foo"\n  data-newline\n  id="p"\n  >\n  <img\n    class="foo"\n    id="img"\n  />\n</p>'],
    ['a multi-line value among attributes on their own lines', { ifAttrsMoreThan: 1 }, '\n<p\n  class="foo"\n  data-newline\n  id="p"\n  title="this\n  is\n  a\n  long\n  value"\n  >\n  <img\n    class="foo"\n    id="img"\n  />\n</p>'],
    ['four attributes under a threshold of three', { ifAttrsMoreThan: 3 }, '\n<button\n  type="button"\n  class="app-button"\n  data-property\n></button>'],
  ];

  it.each(validByNewline)('accepts %s with closeStyle newline', async (_name, options, code) => {
    expect((await lint(code, { closeStyle: 'newline', ...options }, 'off')).messages).toEqual([]);
  });

  const invalid: [string, Record<string, unknown>, string, string][] = [
    ['an attribute on the tag line with closeStyle sameline', { closeStyle: 'sameline', ifAttrsMoreThan: 0 }, '\n<p class="foo">\n  <img />\n</p>', '\n<p\nclass="foo">\n  <img />\n</p>'],
    ['a > after the last attribute with closeStyle newline', { closeStyle: 'newline', ifAttrsMoreThan: 0 }, '\n<p\n  class="foo">\n  <img />\n</p>', '\n<p\nclass="foo"\n>\n  <img />\n</p>'],
    ['two attributes sharing a line', { closeStyle: 'newline', ifAttrsMoreThan: 1 }, '\n<p\n  class="foo" id="p">\n  <img />\n</p>', '\n<p\nclass="foo"\nid="p"\n>\n  <img />\n</p>'],
  ];

  it.each(invalid)('lays out %s', async (_name, options, code, output) => {
    const { messages, output: fixedOutput } = await lint(code, options, 'off');
    expect(messages).toHaveLength(0);
    expect(stripIndentation(fixedOutput)).toBe(stripIndentation(output));
  });
});
