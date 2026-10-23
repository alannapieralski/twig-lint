import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findInterpolatedStrings, parseForESLint, readTwigServices, type ParserOptions, type TwigParserServices } from '../../src/index.js';
import { checkParserOutput } from '../support/output-checks.js';

type Node = { type: string; range: [number, number]; loc: { start: { line: number; column: number } }; [key: string]: unknown };

const fixturesDirectory = new URL('../fixtures/twig/', import.meta.url);

function parse(code: string, options: ParserOptions = {}) {
  const result = parseForESLint(code, options);
  return { result, statements: result.ast.twigBody as unknown as Node[], services: result.services.twig };
}

function unparsedTwig(services: TwigParserServices) {
  return services.diagnostics.filter((diagnostic) => diagnostic.code === 'x-unparsed-twig');
}

function collectNodes(value: unknown, predicate: (node: Node) => boolean, found: Node[] = []): Node[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNodes(item, predicate, found));
    return found;
  }
  if (typeof value !== 'object' || value === null || typeof (value as Node).type !== 'string') return found;

  const node = value as Node;
  if (predicate(node)) found.push(node);
  for (const [key, child] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'range' && key !== 'parent') collectNodes(child, predicate, found);
  }
  return found;
}

function sourceOf(code: string, node: Node): string {
  return code.slice(node.range[0], node.range[1]);
}

function onlyStatement(code: string): Node {
  const { statements, services } = parse(code);
  expect(unparsedTwig(services)).toEqual([]);
  expect(statements).toHaveLength(1);
  return statements[0] as Node;
}

function expressionOf(code: string): Node {
  return onlyStatement(code)['expression'] as Node;
}

const blocksTwigItselfRejectsByFixture: Record<string, string[]> = {
  'operators.twig': ['{{ foo.is not }}'],
};

const tagsOf = (code: string) => collectNodes(parse(code).result.ast.body, (node) => node.type === 'Tag');
const namedTag = (code: string, name: string) => tagsOf(code).find((tag) => tag['name'] === name) as Node;

describe('fixtures', () => {
  const fixtureNames = readdirSync(fixturesDirectory).filter((name) => name.endsWith('.twig'));

  it.each(fixtureNames)('%s converts every block Twig accepts and keeps every literal at its real source position', (fixtureName) => {
    const code = readFileSync(new URL(fixtureName, fixturesDirectory), 'utf8');
    const { statements, services } = parse(code);
    const unconvertedSources = unparsedTwig(services).map((block) => code.slice(...block.range));
    expect(unconvertedSources).toEqual(blocksTwigItselfRejectsByFixture[fixtureName] ?? []);

    const literals = collectNodes(statements, (node) => node.type === 'Literal');
    for (const literal of literals) expect(sourceOf(code, literal)).toBe(literal['raw']);

    const strings = collectNodes(statements, (node) => node.type === 'TemplateLiteral');
    for (const string of strings) {
      const source = sourceOf(code, string);
      expect(source.at(0)).toMatch(/['"]/);
      expect(source.at(-1)).toBe(source.at(0));
    }
  });

  it.each(fixtureNames)('%s produces output that matches the source node by node', (fixtureName) => {
    const code = readFileSync(new URL(fixtureName, fixturesDirectory), 'utf8');
    const rejectedByTwig = blocksTwigItselfRejectsByFixture[fixtureName] ?? [];
    const issues = checkParserOutput(code).filter((issue) => !rejectedByTwig.some((source) => issue.detail.startsWith(source)));
    expect(issues).toEqual([]);
  });
});

describe('print statements and delimiters', () => {
  it('wraps {{ }} contents as a parenthesised expression', () => {
    expect(expressionOf('{{ foo }}')).toMatchObject({ type: 'Identifier', name: 'foo' });
  });

  it.each(['{{- foo -}}', '{{~ foo ~}}', '{{foo}}'])('ignores whitespace control in %s', (code) => {
    expect(expressionOf(code)).toMatchObject({ type: 'Identifier', name: 'foo' });
  });

  it('parses hashes rather than block statements', () => {
    expect(expressionOf('{{ {a: {b: 1}} }}')).toMatchObject({ type: 'ObjectExpression' });
  });

  it('skips inline # comments', () => {
    expect(expressionOf('{{ foo # a comment with }} inside\n}}')).toMatchObject({ type: 'Identifier', name: 'foo' });
  });
});

describe('strings and numbers', () => {
  it('turns interpolated double-quoted strings into template literals', () => {
    const code = '{{ "a-#{b}-c" }}';
    const expression = expressionOf(code);
    expect(expression).toMatchObject({ type: 'TemplateLiteral', expressions: [{ type: 'Identifier', name: 'b' }] });
    expect(sourceOf(code, expression)).toBe('"a-#{b}-c"');
  });

  it.each([
    ["{{ 'flex p-4' }}", 'flex p-4'],
    ['{{ "hash # here" }}', 'hash # here'],
    ["{{ 'it\\'s' }}", "it's"],
  ])('turns the plain string in %s into a template literal without expressions, keeping its Twig quotes in range', (code, cooked) => {
    const expression = expressionOf(code);
    expect(expression).toMatchObject({ type: 'TemplateLiteral', expressions: [], quasis: [{ value: { cooked } }] });
    expect(sourceOf(code, expression)).toBe(code.slice(3, -3));
  });

  it('parses strings that span several lines, which Twig allows', () => {
    const code = "{% set classes = ['\n  flex p-4\n  md:grid\n', \"\n  a #{b}\n\"] %}";
    const elements = (onlyStatement(code)['declarations'] as Node[])[0]?.['init'] as Node;
    expect(elements).toMatchObject({
      type: 'ArrayExpression',
      elements: [{ type: 'TemplateLiteral', expressions: [] }, { type: 'TemplateLiteral', expressions: [{ name: 'b' }] }],
    });
  });

  it('keeps hash keys plain string literals, since a template literal cannot be a key', () => {
    expect(expressionOf("{{ create_attribute({'class': 'flex'}) }}")).toMatchObject({
      arguments: [{ type: 'ObjectExpression', properties: [{ key: { type: 'Literal', value: 'class' }, value: { type: 'TemplateLiteral' } }] }],
    });
  });

  it('keeps strings containing a backtick or ${ as plain literals', () => {
    expect(expressionOf("{{ 'a`b' }}")).toMatchObject({ type: 'Literal', value: 'a`b' });
    expect(expressionOf("{{ 'a${b}' }}")).toMatchObject({ type: 'Literal', value: 'a${b}' });
  });

  it('finds the range of every interpolated string, including ones nested inside another interpolation', () => {
    const code = `<p class="a #{b}">{% set c = ['x', "y #{z}", "p #{q ~ "r #{s}"}"] %}{{ 'plain #{no}' }}</p>`;
    expect(findInterpolatedStrings(code).map((range) => code.slice(...range))).toEqual(['"y #{z}"', '"r #{s}"', '"p #{q ~ "r #{s}"}"']);
  });

  it('lists every Twig string with its quote, including ones in tags that never become JavaScript', () => {
    const code = `{% extends "base.twig" %}<p title="{{ 'x' }}">{{ "a #{ 'b' }" ~ "c" }}</p>{# "d" #}{% verbatim %}{{ "e" }}{% endverbatim %}`;
    const { services } = parse(code);
    expect(services.strings.map((string) => [code.slice(...string.range), string.quote, string.isInterpolated])).toEqual([
      ['"base.twig"', '"', false],
      ["'x'", "'", false],
      ["'b'", "'", false],
      [`"a #{ 'b' }"`, '"', true],
      ['"c"', '"', false],
    ]);
  });

  it('accepts escaped quotes and escaped line breaks', () => {
    expect(onlyStatement("{{ 'it\\'s' ~ 'a \\\nb' }}")).toBeDefined();
  });

  it.each(['{{ 1_000 }}', '{{ 1.5e-3 }}', '{{ items.0 }}', '{{ 12345|format_size }}', '{{ 1..5 }}'])('converts %s', (code) => {
    expect(onlyStatement(code)).toBeDefined();
  });
});

describe('operators', () => {
  it.each([
    ['{{ a and b }}', 'LogicalExpression'],
    ['{{ a xor b }}', 'BinaryExpression'],
    ['{{ not a }}', 'UnaryExpression'],
    ['{{ a b-and b }}', 'BinaryExpression'],
    ['{{ a ~ b }}', 'BinaryExpression'],
    ['{{ a // b }}', 'BinaryExpression'],
    ['{{ a <=> b }}', 'BinaryExpression'],
    ['{{ a not in b }}', 'BinaryExpression'],
    ['{{ a starts with b }}', 'BinaryExpression'],
    ['{{ a has some x => x > 1 }}', 'SequenceExpression'],
    ['{{ a === b }}', 'BinaryExpression'],
    ['{{ a ?? b }}', 'LogicalExpression'],
    ['{{ a ?: b }}', 'LogicalExpression'],
    ['{{ a ? : b }}', 'LogicalExpression'],
    ['{{ a ? b : c }}', 'ConditionalExpression'],
    ['{{ a ? b }}', 'LogicalExpression'],
    ['{{ a is defined }}', 'BinaryExpression'],
    ['{{ a is not same as(b) }}', 'BinaryExpression'],
    ['{{ a?.b }}', 'ChainExpression'],
  ])('%s becomes a %s', (code, type) => {
    expect(expressionOf(code)).toMatchObject({ type });
  });

  it('turns filters into method calls', () => {
    expect(expressionOf("{{ items|join(', ') }}")).toMatchObject({
      type: 'CallExpression',
      callee: { type: 'MemberExpression', property: { name: 'join' } },
    });
  });

  it('turns named arguments into assignments', () => {
    expect(expressionOf('{{ f(name: value) }}')).toMatchObject({ type: 'CallExpression', arguments: [{ type: 'AssignmentExpression' }] });
  });

  it('keeps computed hash keys computed', () => {
    expect(expressionOf("{{ {(a ~ 'x'): 1} }}")).toMatchObject({ type: 'ObjectExpression', properties: [{ computed: true }] });
  });

  it('keeps short ternaries inside arrays separate per element', () => {
    const expression = expressionOf("{{ [required ? 'a', 'b'] }}");
    expect(expression).toMatchObject({ type: 'ArrayExpression', elements: [{ type: 'LogicalExpression', operator: '&&' }, { type: 'TemplateLiteral' }] });
  });

  it.each([
    ["{{ a ? 'b' }}", '&&'],
    ["{{ a ?'b' }}", '&&'],
    ["{{ a?'b' }}", '&'],
    ["{{ a ?\n  'b' }}", '&&'],
  ])('turns the short ternary in %s into %s, keeping the value on the right', (code, operator) => {
    expect(expressionOf(code)).toMatchObject({ operator, right: { type: 'TemplateLiteral' } });
    expect(checkParserOutput(code)).toEqual([]);
  });

  it.each([
    ['{{ a ?? b and c }}', '&&'],
    ['{{ a ?? b or c }}', '||'],
    ['{{ a ?? b ?: c }}', '||'],
    ["{{ a ?? b ? 'c' }}", '&&'],
    ['{{ a ?? b == c }}', '=='],
    ['{{ a ?? b is empty }}', '=='],
    ["{{ a|default(1) ?? b.c(d) ~ 'e' }}", '+'],
  ])('groups the ?? in %s as Twig does, under %s', (code, operator) => {
    expect(expressionOf(code)).toMatchObject({ operator, left: { type: 'LogicalExpression', operator: '??' } });
    expect(checkParserOutput(code)).toEqual([]);
  });

  it.each([
    ['{{ a and b ?? c }}', { operator: '&&', right: { operator: '??' } }],
    ['{{ not a ?? b }}', { type: 'UnaryExpression', argument: { operator: '??' } }],
    ['{{ x or a ?? b ?? c }}', { operator: '||', right: { operator: '??', left: { operator: '??' } } }],
  ])('groups the ?? chain in %s as Twig does', (code, shape) => {
    expect(expressionOf(code)).toMatchObject(shape);
    expect(checkParserOutput(code)).toEqual([]);
  });

  it('reads ?? as || when there is no space for brackets around it', () => {
    expect(expressionOf('{{ f(a??b and c) }}')).toMatchObject({ arguments: [{ operator: '||', right: { operator: '&&' } }] });
  });

  it('parses arrow functions, spreads and dynamic macro calls', () => {
    expect(onlyStatement('{{ items|map(i => i.x) }}')).toBeDefined();
    expect(onlyStatement('{{ [...a, ...b] }}')).toBeDefined();
    expect(onlyStatement('{{ macros.(name)(args) }}')).toBeDefined();
  });

  it('renames JavaScript reserved words used as Twig variables', () => {
    expect(expressionOf('{{ class }}')).toMatchObject({ type: 'Identifier', name: '_lass' });
  });
});

describe('tags', () => {
  it('turns {% set %} into a variable declaration', () => {
    const code = "{% set classes = ['a', 'b'] %}";
    const statement = onlyStatement(code);
    expect(statement).toMatchObject({
      type: 'VariableDeclaration',
      declarations: [{ id: { name: 'classes' }, init: { type: 'ArrayExpression' } }],
    });
  });

  it('keeps multi-line {% set %} positions on their real lines', () => {
    const code = "{%\n  set classes = [\n    'first',\n    'second',\n  ]\n%}";
    const strings = collectNodes(onlyStatement(code), (node) => node.type === 'TemplateLiteral');
    expect(strings.map((string) => [sourceOf(code, string), string.loc.start.line])).toEqual([["'first'", 3], ["'second'", 4]]);
  });

  it('keeps multiple-target {% set %} a declaration', () => {
    expect(onlyStatement("{% set a, classes = 1, ['x'] %}")).toMatchObject({
      type: 'VariableDeclaration',
      declarations: [{ id: { type: 'ArrayPattern' }, init: { type: 'ArrayExpression' } }],
    });
  });

  it('supports {% set %} capture blocks and destructuring', () => {
    expect(onlyStatement('{% set c %}{% endset %}')).toMatchObject({ type: 'VariableDeclaration' });
    expect(onlyStatement('{% set [a, b] = x %}')).toMatchObject({ type: 'VariableDeclaration' });
    expect(expressionOf('{% do {name: userName} = user %}')).toMatchObject({ type: 'AssignmentExpression' });
  });

  it('represents {% include %} and {% embed %} as calls with the with-hash as an argument', () => {
    expect(expressionOf("{% include 'card' with { classes: ['a'] } only %}")).toMatchObject({
      type: 'CallExpression',
      callee: { name: 'include' },
      arguments: [{ type: 'TemplateLiteral', quasis: [{ value: { cooked: 'card' } }] }, { type: 'ObjectExpression' }],
    });
    expect(expressionOf("{% embed 'card' ignore missing with { a: 1 } %}{% endembed %}")).toMatchObject({ type: 'CallExpression', callee: { name: 'embed' } });
  });

  it('parses the iterated expression of {% for %}, including the Twig 2 if filter', () => {
    expect(expressionOf('{% for key, item in items %}{% endfor %}')).toMatchObject({ type: 'Identifier', name: 'items' });
    expect(expressionOf("{% for item in items if item != '' %}{% endfor %}")).toMatchObject({ type: 'SequenceExpression' });
  });

  it.each(['{% if a and b %}{% endif %}', '{% do x = 1 %}', '{% with { a: 1 } only %}{% endwith %}', "{% macro input(classes = ['a']) %}{% endmacro %}", "{% block title 'value' %}"])(
    'parses the expression in %s',
    (code) => {
      expect(onlyStatement(code)).toBeDefined();
    },
  );

  it('parses the expression in {% elseif a %}', () => {
    expect(parse('{% if x %}{% elseif a %}{% endif %}').statements).toHaveLength(2);
  });

  it.each([
    ["{% extends 'base' %}", 1],
    ["{% my_custom_tag some 'argument' %}", 1],
    ['{% trans %}{% endtrans %}', 2],
    ["{% cache 'key' ttl(300) %}{% endcache %}", 2],
    ['{% block title %}{% endblock %}', 2],
  ])('leaves %s out without reporting it as a failure', (code, ignoredBlockCount) => {
    const { statements, services } = parse(code);
    expect(statements).toEqual([]);
    expect(services).toMatchObject({ ignoredBlockCount });
    expect(unparsedTwig(services)).toEqual([]);
  });

  it.each([
    ['an end tag with no tag open', '<div>\n{% endif %}\n</div>', 2, "{% endif %} has no tag to belong to"],
    ['an else with no tag open', '<div>\n{% else %}\n</div>', 2, "{% else %} has no tag to belong to"],
    ['a bare end tag', '{% if a %}\n{% end %}', 2, '{% end %} cannot close {% if %}, which needs {% endif %}'],
    ['an end tag closing the wrong tag', '{% if a %}\n{% endfor %}', 2, '{% endfor %} cannot close {% if %}, which needs {% endif %}'],
    ['an extra end tag', '{% for a in b %}{% endfor %}\n{% endfor %}', 2, '{% endfor %} has no tag to belong to'],
    ['a tag that is never closed', '<p>\n  {% if a %}\n</p>', 2, '{% if %} is never closed, it needs {% endif %}'],
    ['a tag left open when its end tag comes', '{% if a %}\n{% if b %}\n{% endif %}', 1, '{% if %} is never closed, it needs {% endif %}'],
  ])('throws a syntax error for %s', (_name, code, line, message) => {
    expect(() => parse(code)).toThrow(expect.objectContaining({ name: 'TwigSyntaxError', lineNumber: line, message: expect.stringContaining(message) }));
  });

  it('does not lex the contents of {% verbatim %}', () => {
    expect(parse('{% verbatim %}{{ not.lexed }}{% endverbatim %}').statements).toEqual([]);
  });
});

describe('markup and options', () => {
  it('parses markup whose Twig comments contain {{ }}', () => {
    const { result } = parse('{# Use {{ content }} #}<p class="a">x</p>');
    const tags = collectNodes(result.ast.body, (node) => node.type === 'Tag');
    expect(tags).toHaveLength(1);
  });

  it('reports every attribute it leaves out through parser services', () => {
    const code = '<p class="a {{ b }}" id="{{ c }}">x</p>';
    const { services } = parse(code, { ignoreInterpolatedAttributes: ['CLASS'] });
    expect(services.omittedAttributes.map((attribute) => [attribute.name, code.slice(...attribute.range)])).toEqual([['class', 'class="a {{ b }}"']]);
    expect(services.omittedAttributes[0]?.attribute).toMatchObject({ type: 'Attribute', key: { value: 'class' } });
  });

  it('names the tag each left-out attribute belonged to, as the node in the tree', () => {
    const code = '<ul><li class="a {{ b }}">x</li></ul><script class="{{ c }}"></script>';
    const { result, services } = parse(code, { ignoreInterpolatedAttributes: ['class'] });
    const ownerTags = [...collectNodes(result.ast.body, (node) => node.type === 'Tag' && node['name'] === 'li'), ...collectNodes(result.ast.body, (node) => node.type === 'ScriptTag')];
    expect(services.omittedAttributes.map((attribute) => attribute.owner)).toEqual(ownerTags);
    expect(services.omittedAttributes.every((attribute, index) => (attribute.owner as object) === ownerTags[index])).toBe(true);
  });

  it('keeps interpolated attributes unless asked to leave them out', () => {
    expect(parse('<p class="a {{ b }}">x</p>').services.omittedAttributes).toEqual([]);
  });

  it('rejects invalid ignoreInterpolatedAttributes values loudly', () => {
    expect(() => parseForESLint('<p></p>', { ignoreInterpolatedAttributes: 'class' } as unknown as ParserOptions)).toThrow(/must be an array of attribute names/);
  });

  it.each([
    ['a string', 'pre'],
    ['an empty name', ['']],
    ['a number', [1]],
  ])('rejects rawContentTags given as %s loudly', (_, rawContentTags) => {
    expect(() => parseForESLint('<p></p>', { rawContentTags } as unknown as ParserOptions)).toThrow(/parserOptions\.rawContentTags must be an array of element names/);
  });

  it('reads the content of rawContentTags as raw text, whatever the case of the names given', () => {
    const code = '<x-code><p>a</p></x-code><p>b</p>';
    const childTypesOf = (rawContentTags: readonly string[]) => ((collectNodes(parse(code, { rawContentTags }).result.ast.body, (node) => node['name'] === 'x-code')[0] as Node)['children'] as Node[]).map((child) => child.type);
    expect(childTypesOf(['X-Code'])).toEqual(['RawContent']);
    expect(childTypesOf(['x-code'])).toEqual(['RawContent']);
    expect(childTypesOf([])).toEqual(['Tag']);
  });

  it('reports blocks it cannot convert instead of dropping them silently', () => {
    const { services } = parse('<p>{{ foo.is not }}</p>');
    expect(unparsedTwig(services)).toMatchObject([{ range: [3, 19] }]);
  });
});

describe('block structure services', () => {
  it('lists every block with its range and how it changes Twig nesting', () => {
    const code = '{% if a %}{{ b }}{# c #}{% else %}{% endif %}';
    const { services } = parse(code);
    expect(services.blocks.map((block) => [block.kind, block.tagName, code.slice(...block.range), block.depthChange])).toEqual([
      ['tag', 'if', '{% if a %}', 1],
      ['print', undefined, '{{ b }}', 0],
      ['comment', undefined, '{# c #}', 0],
      ['tag', 'else', '{% else %}', 0],
      ['tag', 'endif', '{% endif %}', -1],
    ]);
  });
});

describe('block bracket pairs', () => {
  it('lists the offsets of each bracket pair, ignoring brackets inside strings', () => {
    const code = "{{ f({ a: [1], b: '(' }) }}";
    const { services } = parse(code);
    expect(services.blocks[0]?.bracketPairs.map(([open, close]) => code.slice(open, close + 1))).toEqual(["({ a: [1], b: '(' })", "{ a: [1], b: '(' }", '[1]']);
  });
});

describe('large templates', () => {
  it('groups 50,000 Twig blocks in linear time', () => {
    const code = '<p>{{ a }}{% if b %}c{% endif %}{# d #}</p>\n'.repeat(12_500);
    const { services } = parse(code);
    expect(services.blocks).toHaveLength(50_000);
    expect(services.blocks.at(-1)?.range[1]).toBe(code.length - '</p>\n'.length);
  });
});

describe('block form tags in block structure services', () => {
  it('opens nesting for block-form set and trans but not for an inline set', () => {
    const { services } = parse('{% set a = 1 %}{% set b %}x{% endset %}{% trans %}y{% endtrans %}');
    expect(services.blocks.map((block) => [block.tagName, block.depthChange])).toEqual([
      ['set', 0],
      ['set', 1],
      ['endset', -1],
      ['trans', 1],
      ['endtrans', -1],
    ]);
  });

  it('opens nesting for a block with a body but not for the short block form', () => {
    const { services } = parse('{% block a %}{% block title page_title %}{%- block b -%}x{% endblock %}{% endblock %}');
    expect(services.blocks.map((block) => [block.tagName, block.depthChange])).toEqual([
      ['block', 1],
      ['block', 0],
      ['block', 1],
      ['endblock', -1],
      ['endblock', -1],
    ]);
  });

  it('opens nesting for a block whose name is followed by an inline comment', () => {
    const { services } = parse('{% block body # the page body\n%}x{% endblock %}');
    expect(services.blocks.map((block) => [block.tagName, block.depthChange])).toEqual([
      ['block', 1],
      ['endblock', -1],
    ]);
  });

  it('opens nesting for a trans with a body but not for Drupal\'s short trans with a string', () => {
    const { services } = parse('{% trans \'Hello\' %}{% trans "Hi" with {\'context\': \'x\'} %}{% trans with {\'context\': \'x\'} %}y{% endtrans %}');
    expect(services.blocks.map((block) => [block.tagName, block.depthChange])).toEqual([
      ['trans', 0],
      ['trans', 0],
      ['trans', 1],
      ['endtrans', -1],
    ]);
  });

  it('treats the short block the same way when it is converted to JavaScript', () => {
    const { services } = parse('{% block body # the page body\n%}x{% endblock %}{% block title page_title %}');
    expect(unparsedTwig(services)).toEqual([]);
    expect(services.convertedBlockCount).toBe(1);
  });
});

describe('readTwigServices', () => {
  it('returns the Twig services of a file parsed by this parser', () => {
    const { result } = parse('<p>{{ a }}</p>');
    const sourceCode = { parserServices: result.services } as Parameters<typeof readTwigServices>[0];
    expect(readTwigServices(sourceCode, 'some-rule').convertedBlockCount).toBe(1);
  });

  it('names the consumer when another parser produced the file', () => {
    const sourceCode = { parserServices: {} } as Parameters<typeof readTwigServices>[0];
    expect(() => readTwigServices(sourceCode, 'some-rule')).toThrow('some-rule needs twig-eslint-parser as the parser for this file.');
  });
});

describe('Twig glued to a tag name', () => {
  const childTagNames = (tag: Node) => (tag['children'] as Node[]).filter((child) => child.type === 'Tag').map((child) => child['name']);
  const attributeSources = (code: string, tag: Node) => (tag['attributes'] as Node[]).map((attribute) => sourceOf(code, attribute));

  it.each(['attributes', 'legend.attributes', "attributes|without('role')", 'attributes.addClass(classes)', "create_attribute({'class': 'a'})", 'attr', 'options.html|join(" ")'])(
    'keeps {{ %s }} in the open tag start of a div closed where the template closes it',
    (expression) => {
      const code = `<div{{ ${expression} }} id="a"><p>x</p></div><span>after</span>`;
      const div = namedTag(code, 'div');
      expect(sourceOf(code, div['openStart'] as Node)).toBe(`<div{{ ${expression} }}`);
      expect(attributeSources(code, div)).toEqual(['id="a"']);
      expect(sourceOf(code, div['close'] as Node)).toBe('</div>');
      expect(childTagNames(div)).toEqual(['p']);
    },
  );

  it('reads a print with whitespace before it as an attribute', () => {
    const code = '<div {{ attributes }} id="a">x</div>';
    expect(attributeSources(code, namedTag(code, 'div'))).toEqual(['{{ attributes }}', 'id="a"']);
  });

  it('keeps the elements after a void element with glued Twig as siblings', () => {
    const code = '<input{{ attr }}><span>after</span>';
    expect(tagsOf(code).map((tag) => tag['name'])).toEqual(['input', 'span']);
    expect(childTagNames(namedTag(code, 'input'))).toEqual([]);
  });

  it.each(['head-placeholder', 'css-placeholder', 'js-placeholder', 'js-bottom-placeholder'])(
    'reads the Drupal placeholder <%s> as a void element so the markup after it stays a sibling',
    (name) => {
      const code = `<head><${name} token="{{ placeholder_token }}"><title>x</title></head>`;
      expect(tagsOf(code).map((tag) => tag['name'])).toEqual(['head', name, 'title']);
      expect(childTagNames(namedTag(code, name))).toEqual([]);
      expect(childTagNames(namedTag(code, 'head'))).toEqual([name, 'title']);
    },
  );

  it('keeps a print glued to a Twig tag name in the open tag start', () => {
    const code = '<{{ tag }}{{ attr }}><li>x</li></{{ tag }}><span>after</span>';
    const [wrapper] = tagsOf(code);
    expect(wrapper?.['name']).toBe('{{ tag }}');
    expect(sourceOf(code, wrapper?.['openStart'] as Node)).toBe('<{{ tag }}{{ attr }}');
    expect(sourceOf(code, wrapper?.['close'] as Node)).toBe('</{{ tag }}>');
    expect(childTagNames(wrapper as Node)).toEqual(['li']);
  });

  it('is not misled by a less-than sign inside Twig', () => {
    const code = '{% if a <b{{ c }} %}<div{{ attr }}>x</div>{% endif %}';
    expect(tagsOf(code).map((tag) => tag['name'])).toEqual(['div']);
  });

  it('keeps every later range and line/column exact after several of them', () => {
    const code = '<ul{{ attributes }}>\n  <li{{ item.attributes }} class="a">x</li>\n</ul>';
    const li = namedTag(code, 'li');
    const [classAttribute] = li['attributes'] as Node[];
    expect(attributeSources(code, li)).toEqual(['class="a"']);
    expect(classAttribute?.loc.start).toEqual({ line: 2, column: code.split('\n')[1]?.indexOf('class') });
    expect(sourceOf(code, li['close'] as Node)).toBe('</li>');
  });

  it('ends the open and close tag names where Twig starts, so they still pair', () => {
    const code = '<h{{ level }} id="a">x</h{{ level }}><span>after</span>';
    const [heading] = tagsOf(code);
    expect(heading?.['name']).toBe('h');
    expect(sourceOf(code, heading?.['openStart'] as Node)).toBe('<h{{ level }}');
    expect(attributeSources(code, heading as Node)).toEqual(['id="a"']);
    expect(sourceOf(code, heading?.['close'] as Node)).toBe('</h{{ level }}>');
    expect(childTagNames(heading as Node)).toEqual([]);
  });
});

describe('Twig delimiters inside Twig strings', () => {
  it.each([
    ["{% set markup = '<div{{ attributes }}>' %}", '<div{{ attributes }}>'],
    ["{{ '}}' }}", '}}'],
    ["{% set end = '%}' %}", '%}'],
    ["{% set text = '{# not a comment #}' %}", '{# not a comment #}'],
    ['{{ "a #{ \'{{\' } b" }}', '{{'],
  ])('parses %s, keeping the string value and the markup after it', (twig, stringValue) => {
    const { result, services } = parse(`${twig}<p>x</p>`);
    expect(unparsedTwig(services)).toEqual([]);
    const strings = collectNodes(result.ast.twigBody, (node) => node.type === 'TemplateLiteral' || node.type === 'Literal');
    const values = strings.flatMap((node) => (node.type === 'Literal' ? [node['value']] : (node['quasis'] as Node[]).map((quasi) => (quasi['value'] as { cooked: string }).cooked)));
    expect(values).toContain(stringValue);
    const tags = collectNodes(result.ast.body, (node) => node.type === 'Tag');
    expect(tags.map((tag) => tag['name'])).toEqual(['p']);
  });

  it('keeps an attribute whose Twig contains a delimiter in a string as one attribute of a closed element', () => {
    const code = "<p title=\"{{ '}}' }}\" id=\"a\">x</p><span>after</span>";
    const tags = collectNodes(parse(code).result.ast.body, (node) => node.type === 'Tag');
    const paragraph = tags.find((tag) => tag['name'] === 'p') as Node;
    expect((paragraph['attributes'] as Node[]).map((attribute) => sourceOf(code, attribute))).toEqual(["title=\"{{ '}}' }}\"", 'id="a"']);
    expect(sourceOf(code, paragraph['close'] as Node)).toBe('</p>');
  });
});

describe('Twig tags and verbatim content inside markup', () => {
  const childTagNames = (tag: Node) => (tag['children'] as Node[]).filter((child) => child.type === 'Tag').map((child) => child['name']);

  it('parses a conditional attribute written straight after the tag name, closed where the template closes it', () => {
    const code = '<div{% if a %} class="x"{% endif %}><p>y</p></div><span>z</span>';
    const div = namedTag(code, 'div');
    expect(sourceOf(code, div['openStart'] as Node)).toBe('<div{% if a %}');
    expect(sourceOf(code, div['close'] as Node)).toBe('</div>');
    expect(childTagNames(div)).toEqual(['p']);
  });

  it('ends a tag name at a Twig tag, and pairs a close tag built the same way', () => {
    const code = '<h{% if big %}1{% else %}2{% endif %} id="a">x</h{% if big %}1{% else %}2{% endif %}><span>after</span>';
    const [heading] = tagsOf(code);
    expect(heading?.['name']).toBe('h');
    expect(sourceOf(code, heading?.['openStart'] as Node)).toBe('<h{% if big %}1{% else %}2{% endif %}');
    expect((heading?.['attributes'] as Node[]).map((attribute) => sourceOf(code, attribute))).toEqual(['id="a"']);
    expect(sourceOf(code, heading?.['close'] as Node)).toBe('</h{% if big %}1{% else %}2{% endif %}>');
    expect(childTagNames(heading as Node)).toEqual([]);
  });

  it('closes an element whose name is built with {{ }} where the template closes it', () => {
    const code = '<h{{ level ?? 3 }} class="a">x</h{{ level ?? 3 }}><span>after</span>';
    const [heading] = tagsOf(code);
    expect(sourceOf(code, heading?.['close'] as Node)).toBe('</h{{ level ?? 3 }}>');
    expect(childTagNames(heading as Node)).toEqual([]);
  });

  it('parses an element whose whole name is Twig, followed by Drupal attributes', () => {
    const code = '<{{ list_type }}{{ attributes }}><li>x</li></{{ list_type }}><span>after</span>';
    const [list] = tagsOf(code);
    expect(list?.['name']).toBe('{{ list_type }}');
    expect(sourceOf(code, list?.['openStart'] as Node)).toBe('<{{ list_type }}{{ attributes }}');
    expect(sourceOf(code, list?.['close'] as Node)).toBe('</{{ list_type }}>');
    expect(childTagNames(list as Node)).toEqual(['li']);
  });

  it('parses verbatim content that holds Twig delimiters as text', () => {
    const code = '{% verbatim %}{# {% endverbatim %}{{ x }}{% verbatim %} #}{% endverbatim %}<p>y</p>';
    expect(tagsOf(code).map((tag) => tag['name'])).toEqual(['p']);
  });

  it.each([
    ["<div {{ '{{ attributes }}' }}>x</div>", "{{ '{{ attributes }}' }}"],
    ["<p title=\"{{ '}}' }}\">x</p>", "\"{{ '}}' }}\""],
  ])('keeps the original text in the HTML nodes of %s', (code, attributeText) => {
    const [attribute] = tagsOf(code)[0]?.['attributes'] as Node[];
    const texts = collectNodes(attribute, () => true).filter((node) => typeof node['value'] === 'string').map((node) => [node['value'], sourceOf(code, node)]);
    for (const [value, source] of texts) expect(value).toBe(source);
    expect(sourceOf(code, attribute as Node).endsWith(attributeText)).toBe(true);
  });
});

describe('Twig as part of the markup structure', () => {
  const keysOf = (code: string, name: string) => (namedTag(code, name)['attributes'] as Node[]).map((attribute) => (attribute['key'] as Node)['value']);

  it('reads a Twig tag before an attribute name as an attribute of its own', () => {
    expect(keysOf('<span {% if x %}class="a"{% endif %}>b</span>', 'span')).toEqual(['{% if x %}', 'class', '{% endif %}']);
  });

  it('reads a Twig tag after an attribute name as an attribute of its own', () => {
    expect(keysOf('<input type="checkbox"{% if checked %} checked{% endif %}>', 'input')).toEqual(['type', '{% if checked %}', 'checked', '{% endif %}']);
  });

  it('keeps a print and the Twig tag after it as separate attributes', () => {
    expect(keysOf('<p {{ a }}{% if b %} id="c"{% endif %}>t</p>', 'p')).toEqual(['{{ a }}', '{% if b %}', 'id', '{% endif %}']);
  });

  it('keeps a print that is part of an attribute name in that name', () => {
    expect(keysOf('<div data-{{ name }}="x"></div>', 'div')).toEqual(['data-{{ name }}']);
  });

  it('skips a Twig comment between attributes', () => {
    expect(keysOf('<a href="x" {# note #} id="y">t</a>', 'a')).toEqual(['href', 'id']);
  });

  it('ends a tag name at a Drupal attributes method call', () => {
    const code = "<div{{ wrapper.addClass('x') }}>t</div>";
    const div = namedTag(code, 'div');
    expect(div['name']).toBe('div');
    expect(sourceOf(code, div['close'] as Node)).toBe('</div>');
  });

  it('pairs a dynamic tag name with a close tag spaced differently', () => {
    const code = '<{{ element }} class="a">t</{{element}}><span>after</span>';
    const element = namedTag(code, '{{ element }}');
    expect(sourceOf(code, element['close'] as Node)).toBe('</{{element}}>');
  });

  it.each([
    ['before markup', '</><p>x</p>'],
    ['in text', 'Use a</> here<p>x</p>'],
    ['at the end', '<p>x</p>a</>'],
    ['spaced', '<p>x</p></ >'],
  ])('drops an empty close tag at the top of the document (%s)', (_, code) => {
    const { result } = parse(code);
    const tags = collectNodes(result.ast.body, (node) => node.type === 'Tag');
    expect(tags.map((tag) => sourceOf(code, tag))).toEqual(['<p>x</p>']);
  });

  it('drops an empty close tag inside an element without closing it', () => {
    const code = '<div>a</>b</div>';
    expect(sourceOf(code, namedTag(code, 'div')['close'] as Node)).toBe('</div>');
  });

  it('closes back to the open element when a never-closed element sits inside it', () => {
    const code = '<html><head><head-placeholder token="x"><title>t</title></head><body><p>x</p></body></html>';
    const head = namedTag(code, 'head');
    expect(sourceOf(code, head['close'] as Node)).toBe('</head>');
    expect(namedTag(code, 'head-placeholder')['close']).toBeUndefined();
    expect(sourceOf(code, namedTag(code, 'body')['close'] as Node)).toBe('</body>');
    expect(sourceOf(code, namedTag(code, 'html')['close'] as Node)).toBe('</html>');
  });

  it('ends elements that an ancestor\'s close tag closes where their content ends', () => {
    const code = '<ul>\n  <li>a\n  <li>b\n</ul>';
    const [outer, inner] = collectNodes(parse(code).result.ast.body, (node) => node.type === 'Tag' && node['name'] === 'li');
    expect([sourceOf(code, outer as Node), sourceOf(code, inner as Node)]).toEqual(['<li>a\n  <li>b\n', '<li>b\n']);
    expect((outer as Node)['loc']).toEqual({ start: { line: 2, column: 2 }, end: { line: 4, column: 0 } });
  });

  it('ends elements left open at the end of the file where their content ends', () => {
    const code = '<div>\n  <p>a <b>b</b>';
    const tags = collectNodes(parse(code).result.ast.body, (node) => node.type === 'Tag');
    expect(tags.map((tag) => sourceOf(code, tag))).toEqual([code, '<p>a <b>b</b>', '<b>b</b>']);
  });

  it('keeps an element left open without content as its open tag', () => {
    const code = '<p>a</p><br-like>';
    expect(sourceOf(code, namedTag(code, 'br-like'))).toBe('<br-like>');
  });

  it('parses 2,000 elements left open inside each other, closed back by one close tag', () => {
    const code = `<ul>${'<li>x'.repeat(2_000)}</ul><p>after</p>`;
    const [document] = parse(code).result.ast.body as unknown as Node[];
    const [list, paragraph] = (document as Node)['children'] as Node[];
    expect(sourceOf(code, (list as Node)['close'] as Node)).toBe('</ul>');
    expect(sourceOf(code, list as Node)).toBe(code.slice(0, -'<p>after</p>'.length));
    expect((paragraph as Node)['name']).toBe('p');
  });

  it('says so when markup is nested too deeply for the call stack', () => {
    expect(() => parse('<div>'.repeat(50_000))).toThrow(/nested too deeply/);
  });

  it('drops 20,000 stray close tags inside deep nesting', () => {
    const code = `${'<div>'.repeat(500)}${'</span>'.repeat(20_000)}${'</div>'.repeat(500)}`;
    expect(collectNodes(parse(code).result.ast.body, (node) => node.type === 'Tag' && node['close'] !== undefined)).toHaveLength(500);
  });

  it('leaves out interpolated attributes from 2,000 nested elements', () => {
    const code = `<ul>${'<li class="a {{ b }}">x'.repeat(2_000)}</ul>`;
    expect(parse(code, { ignoreInterpolatedAttributes: ['class'] }).services.omittedAttributes).toHaveLength(2_000);
  });

  it('pairs a close tag that ends in a stray slash, as a browser does', () => {
    const code = '<{{ title_tag }}>t</{{ title_tag }}/><p>after</p>';
    expect(sourceOf(code, namedTag(code, '{{ title_tag }}')['close'] as Node)).toBe('</{{ title_tag }}/>');
  });

  it('drops a close tag that matches no open element', () => {
    const code = '<div></div></span><p>x</p>';
    expect(tagsOf(code).map((tag) => tag['name'])).toEqual(['div', 'p']);
  });

  it.each(['textarea', 'title'])('reads %s content as raw text', (element) => {
    const code = `<${element}><b class="x">y</b>{{ z }}</${element}><p>after</p>`;
    expect(tagsOf(code).map((tag) => tag['name'])).toEqual([element, 'p']);
  });

  it('keeps a Twig string holding a script close tag inside the script', () => {
    const code = "<script>var a = '{{ '</script>' }}';</script><p>x</p>";
    const scripts = collectNodes(parse(code).result.ast.body, (node) => node.type === 'ScriptTag');
    expect(scripts.map((script) => sourceOf(code, script['close'] as Node))).toEqual(['</script>']);
    expect(tagsOf(code).map((tag) => tag['name'])).toEqual(['p']);
  });
});

describe('unquoted attribute values', () => {
  const valuesOf = (tag: Node) => (tag['attributes'] as Node[]).map((attribute) => (attribute['value'] as Node | undefined)?.['value']);

  it.each([
    ['<a href=/home>t</a>', '/home'],
    ['<a href=a/b>t</a>', 'a/b'],
    ['<a href=//cdn/x id=y>t</a>', '//cdn/x'],
    ['<a href={{ path }}/x>t</a>', '{{ path }}/x'],
  ])('keeps the slashes in %s', (code, value) => {
    expect(valuesOf(namedTag(code, 'a'))[0]).toBe(value);
  });

  it.each([
    ['<a href=/>t</a>', 'a', '/'],
    ['<div class=a/><p>x</p></div>', 'div', 'a/'],
    ['<input value=a/><p>x</p>', 'input', 'a/'],
    ['<div class= /><p>x</p></div>', 'div', '/'],
  ])('keeps a slash before > in the unquoted value of %s, as HTML does', (code, name, value) => {
    const tag = namedTag(code, name);
    expect(valuesOf(tag)).toEqual([value]);
    expect(sourceOf(code, tag['openEnd'] as Node)).toBe('>');
  });

  it('leaves a non-void element open when its unquoted value ends in a slash', () => {
    const div = namedTag('<div class=a/><p>x</p></div>', 'div');
    expect(div['selfClosing']).toBe(false);
    expect((div['children'] as Node[]).map((child) => child['name'])).toEqual(['p']);
  });

  it('still reads /> as self-closing after a quoted value or a space', () => {
    expect(namedTag('<div class="a"/><p>x</p>', 'div')['selfClosing']).toBe(true);
    expect(namedTag('<div class=a /><p>x</p>', 'div')['selfClosing']).toBe(true);
  });

  it.each([
    ['<a href=x/', 'x/'],
    ['<a href=x', 'x'],
  ])('keeps an unquoted value that runs to the end of the input in %s', (code, value) => {
    expect(valuesOf(namedTag(code, 'a'))).toEqual([value]);
  });
});

describe('tags without optional whitespace', () => {
  it('still parses {%include%} written without a space after the tag name', () => {
    expect(expressionOf("{%include'card'with{classes:['a']}%}")).toMatchObject({
      type: 'SequenceExpression',
      expressions: [{ type: 'TemplateLiteral', quasis: [{ value: { cooked: 'card' } }] }, { type: 'ObjectExpression' }],
    });
  });
});
