import { describe, expect, it } from 'vitest';
import { parseForESLint, type DiagnosticCode } from '../../src/index.js';

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

  it('reports an attribute quote that is never closed', () => {
    expect(codesOf('<div class="a><p>x</p></div>')).toContain('eof-in-tag');
  });

  it('stays quiet for a tag that ends with > or />', () => {
    expect(codesOf('<div class="a"><br/><img src="a"></div>')).toEqual([]);
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

  it('stays quiet for quotes inside a quoted value and inside Twig strings that hold }}', () => {
    expect(codesOf(`<p title='say "hi"' data-a="it's" data-b="{{ '}}' }}" data-c='{{ "}}" }}'>x</p>`)).toEqual([]);
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

  it('stays quiet for the closing tag of a void element, as in an RSS template', () => {
    expect(codesOf('<link>{{ url }}</link>')).toEqual([]);
  });

  it('stays quiet for every closing tag when markup pairs across Twig branches', () => {
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

describe('diagnostics', () => {
  it('lists every problem in source order', () => {
    const code = '<div>{{ a b }}{% block x %}{% else %}{% endblock %}</span>';
    expect(diagnosticsOf(code).map((diagnostic) => diagnostic.range[0])).toEqual([0, 5, 27, 51]);
  });

  it('is empty for a sound template', () => {
    expect(diagnosticsOf('<div class="a">{% if b %}<p>{{ c }}</p>{% endif %}</div>')).toEqual([]);
  });
});
