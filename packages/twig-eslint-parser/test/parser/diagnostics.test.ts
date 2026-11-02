import { describe, expect, it } from 'vitest';
import { VOID_ELEMENT_NAMES } from '../../src/html/syntax.js';
import { parseForESLint } from '../../src/index.js';
import type { DiagnosticCode } from '../../src/index.js';

function diagnosticsOf(code: string) {
  return parseForESLint(code).services.twig.diagnostics;
}

function codesOf(code: string): DiagnosticCode[] {
  return diagnosticsOf(code).map((diagnostic) => diagnostic.code);
}

describe('eof-in-tag', () => {
  it('reports an open tag that never ends with >', () => {
    const [diagnostic] = diagnosticsOf('<div class="a"');
    expect(diagnostic).toMatchObject({ code: 'eof-in-tag', range: [0, 14] });
  });

  it('reports it once when only a line break follows it', () => {
    expect(codesOf('<p>a</p>\n<li class="a"\n')).toEqual(['eof-in-tag']);
  });

  it.each([
    ['<div class="a><p>x</p></div>', [0, 28]],
    ['<span class="abc', [0, 16]],
  ])('reports an attribute quote that is never closed once, over the rest of the file: %j', (code, range) => {
    expect(diagnosticsOf(code)).toEqual([expect.objectContaining({ code: 'eof-in-tag', range })]);
  });

  it('stays quiet for a tag that ends with > or />', () => {
    expect(codesOf('<div class="a"><br/><img src="a"></div>')).toEqual([]);
  });

  it.each([
    ['<p>a</p>\n<div', [9, 13]],
    ['<div{{ attributes }}', [0, 20]],
    ['<div>a</div><!-- ok --></div', [23, 28]],
    ['<!DOCTYPE html', [0, 14]],
  ])('reports a tag cut off by the end of the file: %j', (code, range) => {
    expect(diagnosticsOf(code)).toEqual([expect.objectContaining({ code: 'eof-in-tag', range })]);
  });

  it.each([
    '<section><div><span class="a',
    '<section><span class="a></span></section>',
    '<div>x</div',
  ])('reports the elements a cut-off tag leaves open, as a browser leaves them open: %j', (code) => {
    expect(codesOf(code).filter((diagnosticCode) => diagnosticCode === 'eof-in-tag')).toHaveLength(1);
    expect(codesOf(code)).toContain('x-unclosed-element');
  });
});

describe('eof-in-comment', () => {
  it('reports a comment that never ends, at its <!--', () => {
    expect(diagnosticsOf('<p>a</p>\n<!-- note\n<p>b</p>')).toEqual([expect.objectContaining({ code: 'eof-in-comment', range: [9, 13] })]);
  });

  it('reads the rest of the file as the comment and reports the elements it leaves open', () => {
    expect(codesOf('<div>\n<!-- note\n<p>b</p>\n</div>')).toEqual(['x-unclosed-element', 'eof-in-comment']);
  });

  it('stays quiet for a comment that ends', () => {
    expect(codesOf('<div></div><!-- ok -->')).toEqual([]);
  });
});

describe('unexpected-solidus-in-tag', () => {
  it.each(['<div/ class="x"\n  id="y">z</div>', '<img src="a" / >'])('reports a / that does not end the tag: %j', (code) => {
    expect(codesOf(code)).toEqual(['unexpected-solidus-in-tag']);
  });
});

describe('elements written as self-closing', () => {
  it.each(['<outline text="a"/>\n<outline text="b"/>', '<svg><path d="a"/></svg>', '<span/>\n<p>b</p>'])('reads them as closed, as XML templates such as OPML need: %j', (code) => {
    expect(codesOf(code)).toEqual([]);
  });
});

describe('duplicate-attribute', () => {
  it('reports each later attribute with a name an earlier one has, on the attribute', () => {
    const code = '<div class="a" id="b" class="c" ID="d">x</div>';
    const diagnostics = diagnosticsOf(code);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['duplicate-attribute', 'duplicate-attribute']);
    expect(diagnostics.map((diagnostic) => code.slice(...diagnostic.range))).toEqual(['class="c"', 'ID="d"']);
    expect(diagnostics[0]?.message).toBe('The attribute "class" is already set on this tag. Browsers ignore every one after the first.');
  });

  it('compares names without regard to case, and attributes with no value', () => {
    expect(codesOf('<input disabled DISABLED>')).toEqual(['duplicate-attribute']);
  });

  it.each([
    '<div class="a" id="b">x</div>',
    '<div {% if a %}class="a"{% else %}class="b"{% endif %}>x</div>',
    '<div class="a" {% if b %}class="b"{% endif %}>x</div>',
    '<div data-{{ a }}="x" data-{{ b }}="y" {{ attributes }} {{ more }}>x</div>',
    '<div {{ attributes }} {{ attributes }}>x</div>',
  ])('stays quiet when the repeat may not render together: %s', (code) => {
    expect(codesOf(code)).toEqual([]);
  });

  it('is left to the tag problem when the tag could not be read cleanly', () => {
    expect(codesOf('<li class="a\' data-x="y" class="z">x</li>')).toEqual(['unexpected-character-in-attribute-name']);
  });
});

describe('unexpected-character-in-attribute-name', () => {
  it.each([
    '<li class="a\' data-x="y" id="z">x</li>',
    '<li class="a data-x="y" id="z">x</li>',
  ])('reports an attribute that holds a quote left over from a mis-quoted value: %s', (code) => {
    const [diagnostic] = diagnosticsOf(code);
    expect(diagnostic).toMatchObject({ code: 'unexpected-character-in-attribute-name', range: [0, code.indexOf('>') + 1] });
  });

  it.each([
    '<button type"button" class="a">x</button>',
    '<button class="a" type"button">x</button>',
    "<button type'button'>x</button>",
  ])('reports a quoted value whose = is missing: %s', (code) => {
    expect(codesOf(code)).toEqual(['unexpected-character-in-attribute-name']);
  });

  it('reports the < before a / when a missing > lets the tag take in the next closing tag', () => {
    expect(codesOf('<ul>\n  <li class="x"{{ item }}</li>\n</ul>')).toEqual(['unexpected-character-in-attribute-name']);
  });

  it('stays quiet for a Twig tag on its own line among the attributes', () => {
    expect(codesOf('<li\n  {% if loop.index < 3 %}\n    class="a"\n  {% endif %}\n>x</li>')).toEqual([]);
  });

  it('stays quiet for quotes inside a quoted value and inside Twig strings that hold }}', () => {
    expect(codesOf('<p title=\'say "hi"\' data-a="it\'s" data-b="{{ \'}}\' }}" data-c=\'{{ "}}" }}\'>x</p>')).toEqual([]);
  });
});

describe('unexpected-character-in-unquoted-attribute-value', () => {
  it('reports an unquoted value that runs into the next tag', () => {
    const [diagnostic] = diagnosticsOf('<li id=b<span>x</span></li>');
    expect(diagnostic).toMatchObject({ code: 'unexpected-character-in-unquoted-attribute-value', range: [0, 14] });
  });

  it.each(['<a title="a<b">x</a>', '<a {{ x < y }}>x</a>', '<a {% if x < y %}b{% endif %}>x</a>'])('stays quiet for a < inside quotes or Twig: %s', (code) => {
    expect(codesOf(code)).toEqual([]);
  });
});

describe('x-invalid-end-tag', () => {
  it.each(['<p>x</p></div>', '<div></span></div>'])('reports a closing tag with no open element: %s', (code) => {
    expect(codesOf(code)).toEqual(['x-invalid-end-tag']);
  });

  it('names the element that is open where the closing tag stands', () => {
    expect(diagnosticsOf('<div>\n  </span>\n</div>')[0]?.message).toBe('</span> does not match the open <div>. Remove it or correct its name.');
    expect(diagnosticsOf('<p>x</p></div>')[0]?.message).toBe('</div> closes nothing, because no element is open. Remove it or add the opening tag.');
  });

  it('says when an earlier tag of the same name ended with "/>", which browsers ignore on that element', () => {
    const [diagnostic] = diagnosticsOf('<div>\n  <button class="a" type="button" />\n  <span>x</span>\n</button>\n</div>');
    expect(diagnostic?.message).toBe('</button> closes nothing, because the <button … /> before it already ended with "/>". Browsers ignore "/>" on this element, so remove the "/" there or remove this closing tag.');
  });

  it('reports the closing tag only', () => {
    expect(diagnosticsOf('<p>x</p></div>')[0]?.range).toEqual([8, 14]);
  });

  it.each([
    '{% if a %}</div>{% endif %}',
    '{% verbatim %}</div>{% endverbatim %}',
    '{% for item in items %}</li>{% endfor %}',
  ])('stays quiet inside a Twig block that may open the element elsewhere: %s', (code) => {
    expect(codesOf(code)).toEqual([]);
  });

  it.each(['<link>{{ url }}</link>', '<p>a</br>b</p>', '<p>x</input></p>'])('stays quiet for the closing tag of a void element, as in an RSS template: %s', (code) => {
    expect(codesOf(code)).toEqual([]);
  });

  it('reports the closing tag of an element written as self-closing, which the parser has already closed', () => {
    expect(codesOf('<div />\n<section><p>x</p></div></section>')).toEqual(['x-invalid-end-tag']);
  });

  it.each([
    '{% for i in items %}<div>{{ i }}</div>{% endfor %}</div>',
    '{% if a %}<p class="a">x</p>{% endif %}<span>y</span></p>',
  ])('reports a stray closing tag after an element of its name that opens and closes inside one Twig branch: %s', (code) => {
    expect(codesOf(code)).toEqual(['x-invalid-end-tag']);
  });

  it('reports a closing tag outside Twig branches although another stands inside one', () => {
    expect(diagnosticsOf('{% if a %}</div>{% endif %}<p>x</p></span>').map((diagnostic) => diagnostic.range)).toEqual([[35, 42]]);
  });

  it('reports a closing tag inside a Twig block whose markup renders once', () => {
    expect(codesOf('{% block content %}<p>x</p></div>{% endblock %}')).toEqual(['x-invalid-end-tag']);
  });

  it('stays quiet for a closing tag whose element a Twig branch already closed', () => {
    const code = '<div>{% for a in b %}{% if c %}<div><ul>{% endif %}<li>{{ a }}</li>{% if d %}</ul></div>{% endif %}{% endfor %}{% if e %}</ul></div>{% endif %}</div>';
    expect(codesOf(code)).toEqual([]);
  });

  it('stays quiet when every closing tag matches', () => {
    expect(codesOf('<div><p>x</p></div><script>a</script><textarea>b</textarea>')).toEqual([]);
  });
});

describe('x-unclosed-element', () => {
  it('reports an element that is never closed, at its open tag', () => {
    const [diagnostic] = diagnosticsOf('<div><p>x</p>');
    expect(diagnostic).toMatchObject({ code: 'x-unclosed-element', range: [0, 5] });
  });

  it('reports an element that a later closing tag closed over', () => {
    expect(diagnosticsOf('<div><span>x</div>').map((diagnostic) => diagnostic.range)).toEqual([[5, 11]]);
  });

  it('reports an unclosed script', () => {
    expect(codesOf('<div><script src="a">')).toEqual(expect.arrayContaining(['x-unclosed-element']));
  });

  it('reports a raw-text element that takes in the rest of the file, and the elements it leaves open', () => {
    expect(diagnosticsOf('<div><style>a{}</stlye>\n<p>x</p></div>').map((diagnostic) => diagnostic.range)).toEqual([[0, 5], [5, 12]]);
  });

  it('reports an element left open inside a Twig block whose markup renders once', () => {
    expect(codesOf('{% block content %}<div><p>x</p>{% endblock %}')).toEqual(['x-unclosed-element']);
  });

  it.each([
    '<ul><li>a<li>b</ul>',
    '<table><tr><td>a<td>b</table>',
    '<p>a<p>b',
    '<br><img src="a"><input><svg><path d="a"/></svg>',
    '<js-placeholder>',
  ])('stays quiet for void elements and optional end tags: %s', (code) => {
    expect(codesOf(code)).toEqual([]);
  });

  it.each([
    '{% if a %}<a href="x">{% else %}<span>{% endif %}text{% if a %}</a>{% else %}</span>{% endif %}',
    '{% if a %}<div class="a">{% else %}<div class="b">{% endif %}x</div>',
    '{% if a %}<div>{% endif %}<p>x</p>{% if a %}</div>{% endif %}',
  ])('stays quiet when the element opens or closes in a Twig branch: %s', (code) => {
    expect(codesOf(code)).toEqual([]);
  });
});

describe('x-misplaced-twig-tag', () => {
  it.each([
    ['{% block a %}{% else %}{% endblock %}', '{% else %} cannot sit inside {% block %}'],
    ['{% for a in b %}{% elseif c %}{% endfor %}', '{% elseif %} cannot sit inside {% for %}'],
    ['{% if a %}{% plural n %}{% endif %}', '{% plural %} cannot sit inside {% if %}'],
    ['{% if a %}{% else %}{% elseif b %}{% endif %}', '{% elseif %} cannot follow {% else %}'],
    ['{% if a %}{% else %}{% else %}{% endif %}', '{% else %} cannot follow {% else %}'],
    ['{% for a in b %}{% else %}{% else %}{% endfor %}', '{% else %} cannot follow {% else %}'],
  ])('reports %s', (code, message) => {
    const diagnostics = diagnosticsOf(code);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'x-misplaced-twig-tag' });
    expect(diagnostics[0]?.message).toContain(message);
  });

  it.each([
    '{% if a %}1{% elseif b %}2{% else %}3{% endif %}',
    '{% for a in b %}{{ a }}{% else %}none{% endfor %}',
    '{% guard function foo %}yes{% else %}no{% endguard %}',
    '{% trans %}one{% plural n %}many{% endtrans %}',
    '{% if a %}{% for b in c %}{% else %}x{% endfor %}{% else %}y{% endif %}',
  ])('stays quiet for %s', (code) => {
    expect(codesOf(code)).toEqual([]);
  });

  it('reports the tag itself', () => {
    expect(diagnosticsOf('{% block a %}{% else %}{% endblock %}')[0]?.range).toEqual([13, 23]);
  });
});

describe('x-unparsed-twig', () => {
  it('reports a for loop that has no "in"', () => {
    const [diagnostic] = diagnosticsOf('{% for item items %}{{ item }}{% endfor %}');
    expect(diagnostic).toMatchObject({ code: 'x-unparsed-twig', range: [0, 20] });
    expect(diagnostic?.message).toContain('needs "in"');
  });

  it('stays quiet for blocks that have nothing to parse', () => {
    expect(codesOf('{% extends "a.twig" %}{% block b %}{% endblock %}{% for a in b %}{% endfor %}')).toEqual([]);
  });

  it('reports a block that is not a valid expression, with the reason', () => {
    const [diagnostic] = diagnosticsOf('<p>{{ title subtitle }}</p>');
    expect(diagnostic).toMatchObject({ code: 'x-unparsed-twig', range: [3, 23] });
    expect(diagnostic?.message).toContain('Unexpected token subtitle');
  });
});

describe('x-unparsed-twig for constructs only JavaScript has', () => {
  it.each([
    ['a missing comma between array items', "{% set classes = ['a' 'b'] %}"],
    ['a missing comma between hash values', "{{ { a: 'x' b: 'y' } }}"],
    ['a string straight after a variable', "{{ title 'suffix' }}"],
    ['a comma outside brackets', '{{ a, b }}'],
    ['a comma outside brackets in a condition', '{% if a, b %}{% endif %}'],
  ])('reports %s', (_name, code) => {
    const [diagnostic] = diagnosticsOf(code);
    expect(diagnostic).toMatchObject({ code: 'x-unparsed-twig' });
    expect(diagnostic?.range[0]).toBe(0);
  });

  it('names what is wrong', () => {
    expect(diagnosticsOf("{{ a 'b' }}")[0]?.message).toContain('missing');
    expect(diagnosticsOf('{{ a, b }}')[0]?.message).toContain('comma');
  });

  it.each([
    ['commas between array items and arguments', "{% set a = ['a', 'b'] %}{{ f(1, 'x') }}"],
    ['commas between hash entries and include parameters', "{% include 'x' with { a: 1, b: 2 } only %}"],
    ['several set targets', '{% set a, b = 1, 2 %}'],
    ['a loop with a condition', '{% for item in items if item.visible %}{% endfor %}'],
    ['macro defaults', "{% macro input(name, value = '') %}{% endmacro %}"],
  ])('stays quiet for %s', (_name, code) => {
    expect(diagnosticsOf(code)).toEqual([]);
  });
});

describe('diagnostics', () => {
  it('lists every problem in source order', () => {
    const code = '<div>{{ a b }}{% block x %}{% else %}{% endblock %}</span>';
    expect(diagnosticsOf(code).map((diagnostic) => diagnostic.range[0])).toEqual([0, 5, 27, 51]);
  });

  it('is empty for a sound template', () => {
    expect(diagnosticsOf('<div class="a">{% if b %}<p>{{ c }}</p>{% endif %}</div>')).toEqual([]);
  });
});

describe('void elements', () => {
  it.each(VOID_ELEMENT_NAMES)('matches the elements the markup parser closes at their open tag: %s', (name) => {
    const document = parseForESLint(`<${name}><p>x</p>`).ast.body[0] as unknown as { children: { name: string; selfClosing: boolean }[] };
    expect(document.children[0]).toMatchObject({ name, selfClosing: true });
  });
});
