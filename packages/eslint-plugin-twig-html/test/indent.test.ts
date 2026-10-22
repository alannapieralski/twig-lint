import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import twigHtml from '../src/index.js';

async function lint(code: string, ruleOptions: unknown[] = [], fix = true, parserOptions: Record<string, unknown> = {}) {
  const rules: Linter.RulesRecord = {
    'twig-html/attrs-newline': 'off',
    'twig-html/multiline-html-element-content-newline': 'off',
    'twig-html/quotes': 'off',
    'twig-html/indent': ['warn', ...ruleOptions],
  };
  const eslint = new ESLint({ overrideConfigFile: true, fix, overrideConfig: [twigHtml.configs.recommended, { files: ['**/*.twig'], languageOptions: { parserOptions }, rules }] });
  const [result] = await eslint.lintText(code, { filePath: 'template.html.twig' });
  if (!result) throw new Error('ESLint returned no result.');
  return { output: result.output ?? code, messages: result.messages };
}

async function fixed(code: string, ruleOptions: unknown[] = []): Promise<string> {
  return (await lint(code, ruleOptions)).output;
}

async function messagesFor(code: string, ruleOptions: unknown[] = []) {
  return (await lint(code, ruleOptions, false)).messages;
}

async function expectUntouched(code: string, ruleOptions: unknown[] = []) {
  expect(await messagesFor(code, ruleOptions)).toEqual([]);
}

describe('twig-html/indent', () => {
  describe('HTML', () => {
    it('indents children one step from their parent and closing tags in line with the opening tag', async () => {
      expect(await fixed('<div>\n<ul>\n<li>a</li>\n</ul>\n</div>')).toBe('<div>\n  <ul>\n    <li>a</li>\n  </ul>\n</div>');
    });

    it('accepts a correctly indented tree', async () => {
      await expectUntouched('<div>\n  <ul>\n    <li>a</li>\n  </ul>\n</div>\n');
    });

    it('indents the text of a title but not the content of a textarea', async () => {
      expect(await fixed('<head>\n<title>\n{{ head_title }}\n</title>\n<textarea>\n  a\n</textarea>\n</head>')).toBe(
        '<head>\n  <title>\n    {{ head_title }}\n  </title>\n  <textarea>\n  a\n</textarea>\n</head>',
      );
    });

    it('fixes a deep tree in one pass', async () => {
      const code = '<a>\n<b>\n<c>\n<d>\n<e>\nx\n</e>\n</d>\n</c>\n</b>\n</a>';
      const messages = await messagesFor(code);
      expect(messages).toHaveLength(9);
      expect(await fixed(code)).toBe('<a>\n  <b>\n    <c>\n      <d>\n        <e>\n          x\n        </e>\n      </d>\n    </c>\n  </b>\n</a>');
    });

    it('removes indentation from top-level content', async () => {
      expect(await fixed('  <p>a</p>\n    <p>b</p>')).toBe('<p>a</p>\n<p>b</p>');
    });

    it('indents every line of multi-line text at the child indent', async () => {
      expect(await fixed('<p>\nSome text\n      that wraps\n</p>')).toBe('<p>\n  Some text\n  that wraps\n</p>');
    });

    it('indents the continuation of text that starts on the opening line', async () => {
      expect(await fixed('<p>Some text\nthat wraps</p>')).toBe('<p>Some text\n  that wraps</p>');
    });

    it('skips blank and whitespace-only lines', async () => {
      await expectUntouched('<div>\n\n  <p>a</p>\n   \n</div>');
    });

    it('reports the expected and found indentation', async () => {
      const [message] = await messagesFor('<div>\n<p>a</p>\n</div>');
      expect(message).toMatchObject({ ruleId: 'twig-html/indent', messageId: 'wrongIndentation', line: 2, message: 'Expected indentation of 2 spaces but found 0 spaces.' });
    });

    it('indents comments like other content and leaves their inner lines alone', async () => {
      expect(await fixed('<div>\n<!-- a\n      b -->\n{# c\n      d #}\n</div>')).toBe('<div>\n  <!-- a\n      b -->\n  {# c\n      d #}\n</div>');
    });

    it('leaves YAML front matter alone', async () => {
      await expectUntouched('---\nlabel: Help\nrelated:\n  - a.b\n---\n<p>x</p>');
    });

    it('keeps the file\'s line endings', async () => {
      expect(await fixed('<div>\r\n<p>a</p>\r\n</div>')).toBe('<div>\r\n  <p>a</p>\r\n</div>');
    });
  });

  describe('Twig', () => {
    it('indents the body of Twig blocks and keeps else and end tags in line with the opening tag', async () => {
      const code = '{% if a %}\n<p>a</p>\n    {% elseif b %}\n<p>b</p>\n{% else %}\n<p>c</p>\n  {% endif %}';
      expect(await fixed(code)).toBe('{% if a %}\n  <p>a</p>\n{% elseif b %}\n  <p>b</p>\n{% else %}\n  <p>c</p>\n{% endif %}');
    });

    it('nests Twig blocks and HTML together', async () => {
      const code = '<ul>\n{% for item in items %}\n<li>\n{{ item }}\n</li>\n{% else %}\n<li>none</li>\n{% endfor %}\n</ul>';
      expect(await fixed(code)).toBe('<ul>\n  {% for item in items %}\n    <li>\n      {{ item }}\n    </li>\n  {% else %}\n    <li>none</li>\n  {% endfor %}\n</ul>');
    });

    it('indents block, embed and block-form set bodies', async () => {
      const code = '{% extends "a" %}\n{% block content %}\n{% embed "b" %}\n{% block c %}\n<p>x</p>\n{% endblock %}\n{% endembed %}\n{% set d %}\n<i>y</i>\n{% endset %}\n{% endblock %}';
      expect(await fixed(code)).toBe(
        '{% extends "a" %}\n{% block content %}\n  {% embed "b" %}\n    {% block c %}\n      <p>x</p>\n    {% endblock %}\n  {% endembed %}\n  {% set d %}\n    <i>y</i>\n  {% endset %}\n{% endblock %}',
      );
    });

    it('does not nest after an inline set or a short block', async () => {
      await expectUntouched('{% block a %}\n  {% set b = 1 %}\n  {% block title page_title %}\n  <p>x</p>\n{% endblock %}');
    });

    it('handles whitespace control on Twig tags', async () => {
      expect(await fixed('{%- if a -%}\n<p>a</p>\n{%- endif -%}')).toBe('{%- if a -%}\n  <p>a</p>\n{%- endif -%}');
    });

    it('indents the lines inside brackets one step from the line that opened them', async () => {
      expect(await fixed('<div>\n  {{ include("a", {\n        b: [\n1,\n  ],\n  }) }}\n  {% set c = {\n      d: 2,\n    } %}\n</div>')).toBe(
        '<div>\n  {{ include("a", {\n    b: [\n      1,\n    ],\n  }) }}\n  {% set c = {\n    d: 2,\n  } %}\n</div>',
      );
    });

    it('indents the parameters of an include', async () => {
      expect(await fixed("{% if a %}\n{% include 'x.twig' with {\ntitle: t,\nitems: [a, b],\n} only %}\n{% endif %}")).toBe(
        "{% if a %}\n  {% include 'x.twig' with {\n    title: t,\n    items: [a, b],\n  } only %}\n{% endif %}",
      );
    });

    it('measures from the line that opened the bracket, as written', async () => {
      await expectUntouched("{%\n  set classes = [\n    'b',\n  ]\n%}\n{% set a = b\n  .c([\n    'd',\n  ])\n%}");
      expect(await fixed("{% set a = b\n  .c([\n'd',\n])\n%}")).toBe("{% set a = b\n  .c([\n    'd',\n  ])\n%}");
    });

    it('indents a method chain one step from the line that starts it, inside brackets or not', async () => {
      expect(await fixed("{% include 'x' with {\nattributes: attributes\n.addClass([\n'a',\n])\n.setAttribute('b', c),\ntitle: t,\n} %}")).toBe(
        "{% include 'x' with {\n  attributes: attributes\n    .addClass([\n      'a',\n    ])\n    .setAttribute('b', c),\n  title: t,\n} %}",
      );
      expect(await fixed('{% set a = b\n.c()\n      .d() %}\n{%\n  set e = f\n.g()\n%}')).toBe('{% set a = b\n  .c()\n  .d() %}\n{%\n  set e = f\n    .g()\n%}');
    });

    it('leaves the closing bracket of one argument among several alone', async () => {
      await expectUntouched("{{ f(a, {\n  'b': 1,\n},\n  {\n    c: 2\n  })\n}}");
    });

    it('leaves lines outside any bracket and not part of a method chain alone', async () => {
      await expectUntouched("{% set a = b and\n      c %}\n{{ c\n? 'd'\n   : 'e' }}\n{% set f = g\n|h %}");
    });

    it('measures a Twig print between attributes from its own line', async () => {
      expect(await fixed('<p>text {{ f({\nid: 1,\n}) }}</p>\n<div\n  {{ attrs({\nid: 1,\n}) }}\n>\n</div>')).toBe(
        '<p>text {{ f({\n  id: 1,\n}) }}</p>\n<div\n  {{ attrs({\n    id: 1,\n  }) }}\n>\n</div>',
      );
    });

    it('leaves lines inside a multi-line string, a comment and an attribute value alone', async () => {
      await expectUntouched('<div class="{{ {\n    a: 1,\n} }}">\n  {{ f("a\n   b") }}\n  {# {\n     two #}\n</div>');
    });

    it('leaves verbatim and raw bodies alone', async () => {
      await expectUntouched('{% verbatim %}\n<p>\n      {{ a }}\n</p>\n{% endverbatim %}');
    });

    it('leaves everything after an open tag with no > alone', async () => {
      await expectUntouched('<div>\n  <li\n  class="a"\n      id="b"\n');
    });

    it('reports a parsing error, and nothing else, when Twig tags do not pair up', async () => {
      const { messages } = await lint('<div>\n<p>a</p>\n{% endif %}\n</div>', [], false);
      expect(messages).toMatchObject([{ ruleId: null, fatal: true, line: 3, column: 1, message: expect.stringContaining("Twig tags don't pair up") }]);
    });

    it('leaves the content of an element opened and closed in different Twig branches alone', async () => {
      const code = '<div>\n  {% if url %}<a href="{{ url }}">{% endif %}\n<span>x</span>\n  {% if url %}</a>{% endif %}\n<p>b</p>\n</div>';
      expect(await fixed(code)).toBe('<div>\n  {% if url %}<a href="{{ url }}">{% endif %}\n<span>x</span>\n  {% if url %}</a>{% endif %}\n  <p>b</p>\n</div>');
    });

    it('leaves the Twig tags of a conditional wrapper in line with each other', async () => {
      const code = '<div>\n{% if error %}\n<div role="alert">\n    {% endif %}\n<p>x</p>\n    {% if error %}\n</div>\n{% endif %}\n</div>';
      expect(await fixed(code)).toBe(code);
    });

    it('leaves a tag alone, its first line included, when a Twig branch starts inside it', async () => {
      await expectUntouched('<ul>\n  {% for field in fields %}\n  <{{ field.tag }}{{ field.attributes }}\n  {% if field.value %}\n  >{{ field.value }}</{{ field.tag }}>\n    {% else %}\n  />\n    {% endif %}\n  {% endfor %}\n</ul>\n');
    });

    it('leaves an element split across branches alone', async () => {
      const code = '{% if a %}\n  <div class="a">\n{% else %}\n  <div class="b">\n{% endif %}\n<p>x</p>\n</div>\n<p>y</p>';
      const { messages } = await lint(code, [], false);
      expect(messages.map((message) => message.line)).toEqual([]);
    });
  });

  describe('attributes', () => {
    it('aligns attributes with the first one when it is on the tag line', async () => {
      expect(await fixed('<div class="a"\n  id="b"\n    data-c>\n</div>')).toBe('<div class="a"\n     id="b"\n     data-c>\n</div>');
    });

    it('indents attributes one step from the tag when the first one is on its own line', async () => {
      expect(await fixed('  <div>\n<input\nclass="a"\n        id="b"\n>\n  </div>')).toBe('<div>\n  <input\n    class="a"\n    id="b"\n  >\n</div>');
    });

    it('indents attributes one step from the tag when only Twig glued to the tag name is on the tag line', async () => {
      expect(await fixed('<div{{ attributes }}\n      class="a"\n id="b"\n>\n</div>')).toBe('<div{{ attributes }}\n  class="a"\n  id="b"\n>\n</div>');
    });

    it('indents attributes one step when alignAttributesVertically is off', async () => {
      expect(await fixed('<div class="a"\n     id="b">\n</div>', [2, { alignAttributesVertically: false }])).toBe('<div class="a"\n  id="b">\n</div>');
    });

    it('uses the attribute option for the attribute step', async () => {
      expect(await fixed('<div\nclass="a"\n>\n</div>', [2, { attribute: 2 }])).toBe('<div\n    class="a"\n>\n</div>');
    });

    it('puts a closing bracket on its own line in line with the tag by default', async () => {
      expect(await fixed('<div\n  class="a"\n    >\n<img\n  src="b"\n    />\n</div>')).toBe('<div\n  class="a"\n>\n  <img\n    src="b"\n  />\n</div>');
    });

    it('uses closeBracket for closing brackets on their own line', async () => {
      expect(await fixed('<div\n  class="a"\n>\n<img\n  src="b"\n/>\n</div>', [2, { closeBracket: 1 }])).toBe('<div\n  class="a"\n  >\n  <img\n    src="b"\n    />\n</div>');
      expect(await fixed('<img\n  src="b"\n/>', [2, { closeBracket: { selfClosingTag: 1 } }])).toBe('<img\n  src="b"\n  />');
    });

    it('nests Twig blocks between attributes', async () => {
      expect(await fixed('<div\n  {% if a %}\n  class="a"\n  {% endif %}\n>\n</div>')).toBe('<div\n  {% if a %}\n    class="a"\n  {% endif %}\n>\n</div>');
    });

    it('indents the attributes of a tag after an element that is never closed from the tag line as written', async () => {
      const code = '<head>\n  <p>\n      <meta charset="utf-8">\n   <link\nrel="a"\nhref="b"\n>\n</head>';
      expect(await fixed(code)).toBe('<head>\n  <p>\n      <meta charset="utf-8">\n   <link\n     rel="a"\n     href="b"\n   >\n</head>');
    });

    it('indents the attributes of a tag after a Drupal placeholder element, which is never closed', async () => {
      const code = '<head>\n  <css-placeholder token="x">\n      <meta charset="utf-8">\n   <link\nrel="a"\nhref="b"\n>\n</head>';
      expect(await fixed(code)).toBe('<head>\n  <css-placeholder token="x">\n  <meta charset="utf-8">\n  <link\n    rel="a"\n    href="b"\n  >\n</head>');
    });

    it('indents the text of a multi-line title after a Drupal placeholder element', async () => {
      const code = '<head>\n<head-placeholder token="x">\n<title>\n  a\n</title>\n</head>';
      expect(await fixed(code)).toBe('<head>\n  <head-placeholder token="x">\n  <title>\n    a\n  </title>\n</head>');
    });

    it('indents the attributes of a tag inside an element split across Twig branches from the tag line as written', async () => {
      const code = '{% if url %}<a href="{{ url }}">{% endif %}\n    <span\nclass="a"\n        id="b"\n>x</span>\n{% if url %}</a>{% endif %}';
      expect(await fixed(code)).toBe('{% if url %}<a href="{{ url }}">{% endif %}\n    <span\n      class="a"\n      id="b"\n    >x</span>\n{% if url %}</a>{% endif %}');
    });

    it('leaves the inside of a multi-line attribute value alone', async () => {
      await expectUntouched('<div\n  class="\n        a\n     b\n"\n>\n</div>');
    });
  });

  describe('elements whose content is left alone', () => {
    it('leaves pre, textarea, script and style content alone and indents their closing tags', async () => {
      const code = '<div>\n<pre>\n    a\n</pre>\n<textarea>\n    b\n</textarea>\n<script>\n    c();\n</script>\n<style>\n    .d {}\n</style>\n</div>';
      expect(await fixed(code)).toBe('<div>\n  <pre>\n    a\n</pre>\n  <textarea>\n    b\n</textarea>\n  <script>\n    c();\n  </script>\n  <style>\n    .d {}\n  </style>\n</div>');
    });

    it('leaves raw-text elements such as textarea alone, closing tag included', async () => {
      expect(await fixed('<div>\n<textarea>\n<b>a</b>\n  </textarea>\n</div>')).toBe('<div>\n  <textarea>\n<b>a</b>\n  </textarea>\n</div>');
    });

    it('leaves the content of elements named in the parser option rawContentTags alone', async () => {
      const code = '<div>\n<code-sample>\n      a\n</code-sample>\n</div>';
      expect((await lint(code, [], true, { rawContentTags: ['code-sample'] })).output).toBe('<div>\n  <code-sample>\n      a\n</code-sample>\n</div>');
    });

    it('leaves the content of elements named in ignores alone', async () => {
      expect(await fixed('<div>\n<svg>\n      <path/>\n</svg>\n</div>', [2, { ignores: ['svg'] }])).toBe('<div>\n  <svg>\n      <path/>\n  </svg>\n</div>');
    });
  });

  describe('large templates', () => {
    it('checks 3,000 elements left open inside each other as quickly as 3', async () => {
      const linesReportedFor = async (count: number) => (await messagesFor(`<ul>\n${'<li>x\n'.repeat(count)}</ul>\n`)).map((message) => message.line);
      expect(await linesReportedFor(3_000)).toEqual(await linesReportedFor(3));
    });
  });

  describe('options', () => {
    it('indents with the given number of spaces', async () => {
      expect(await fixed('<div>\n<p>a</p>\n</div>', [4])).toBe('<div>\n    <p>a</p>\n</div>');
    });

    it('indents with tabs', async () => {
      expect(await fixed('<div>\n  <p>\n    a\n  </p>\n</div>', ['tab'])).toBe('<div>\n\t<p>\n\t\ta\n\t</p>\n</div>');
    });

    it('describes tabs in the message', async () => {
      const [message] = await messagesFor('<div>\n<p>a</p>\n</div>', ['tab']);
      expect(message?.message).toBe('Expected indentation of 1 tab but found 0 tabs.');
    });
  });
});
