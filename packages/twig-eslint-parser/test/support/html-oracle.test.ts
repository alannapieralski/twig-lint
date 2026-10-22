import { describe, expect, it } from 'vitest';
import { parseHtmlProgram } from '../../src/html/program.js';
import { parseForESLint } from '../../src/index.js';
import type { Golden } from '../lexer/parity.js';
import { compareWithHtmlOracle, twigRangesFromOracle, type TwigRange } from './html-oracle.js';

const twigTypeByKind = {
  text: 'text',
  print: 'begin of print statement',
  endPrint: 'end of print statement',
  tag: 'begin of statement block',
  endTag: 'end of statement block',
  end: 'end of template',
} as const;

type CompactToken = readonly [kind: keyof typeof twigTypeByKind, byteOffset: number, text?: string];

function golden(tokens: readonly CompactToken[]): Golden {
  return { twig: '3.28.0', tokens: tokens.map(([kind, offset, text]) => ({ type: twigTypeByKind[kind], value: text ?? '', line: 1, offset })) };
}

function plainHtml(source: string): CompactToken[] {
  return [['text', 0, source], ['end', Buffer.byteLength(source)]];
}

function oracleIssues(source: string, tokens: readonly CompactToken[]) {
  return compareWithHtmlOracle(source, twigRangesFromOracle(source, golden(tokens)), parseForESLint(source).ast).map(({ check, detail }) => ({ check, detail }));
}

function issuesForTreeWithoutTwigKinds(source: string, tokens: readonly CompactToken[]) {
  const ranges = twigRangesFromOracle(source, golden(tokens));
  const templateInfos = ranges.map(({ start, end }): [number, number] => [start, end]);
  const ast = parseHtmlProgram(source, { templateInfos, rawContentTags: [] });
  return compareWithHtmlOracle(source, ranges, ast).map(({ check, detail }) => ({ check, detail }));
}

function withoutCloseOf(ast: unknown, name: string): unknown {
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    if (record['type'] === 'Tag' && record['name'] === name) delete record['close'];
    for (const [key, child] of Object.entries(record)) {
      if (key !== 'parent') (Array.isArray(child) ? child : [child]).forEach(visit);
    }
  };
  visit(ast);
  return ast;
}

function checksOf(issues: readonly { check: string }[]): string[] {
  return [...new Set(issues.map((issue) => issue.check))].sort();
}

describe('twigRangesFromOracle', () => {
  it('derives print, tag and comment ranges through whitespace control, verbatim and multibyte text', () => {
    const source = '<p class="{{ a }}">  {{- b -}}  {# c #}  {%- if x ~%}é\n{% endif %}{% verbatim %}{{ y }}{% endverbatim %}</p>{# end #}';
    const tokens: CompactToken[] = [
      ['text', 0, '<p class="'], ['print', 10], ['endPrint', 15], ['text', 17, '">'], ['print', 21], ['endPrint', 27],
      ['tag', 41], ['endTag', 50], ['text', 53, 'é\n'], ['tag', 56], ['endTag', 65], ['text', 81, '{{ y }}'], ['text', 105, '</p>'], ['end', 118],
    ];

    expect(twigRangesFromOracle(source, golden(tokens))).toEqual<TwigRange[]>([
      { start: 10, end: 17, kind: 'print' },
      { start: 21, end: 30, kind: 'print' },
      { start: 32, end: 39, kind: 'comment' },
      { start: 41, end: 53, kind: 'tag' },
      { start: 55, end: 66, kind: 'tag' },
      { start: 66, end: 80, kind: 'tag' },
      { start: 87, end: 104, kind: 'tag' },
      { start: 108, end: 117, kind: 'comment' },
    ]);
  });

  it('matches normalised text against CRLF line endings', () => {
    const source = '<p>\r\n{# note #}\r\n{{ a }}\r\n</p>';
    const tokens: CompactToken[] = [['text', 0, '<p>\n'], ['print', 17], ['endPrint', 22], ['text', 24, '\n</p>'], ['end', 30]];

    expect(twigRangesFromOracle(source, golden(tokens))).toEqual<TwigRange[]>([
      { start: 5, end: 15, kind: 'comment' },
      { start: 17, end: 24, kind: 'print' },
    ]);
  });

  it('throws when the tokens do not describe the source', () => {
    const source = '<p>{{ a }}</p>';

    expect(() => twigRangesFromOracle(source, golden([['text', 0, '<p>'], ['endPrint', 8], ['end', 14]]))).toThrow(/closes no open print block/);
    expect(() => twigRangesFromOracle(source, golden([['text', 0, '<div>'], ['end', 14]]))).toThrow(/does not match the source/);
    expect(() => twigRangesFromOracle(source, golden([['text', 0, '<p>'], ['end', 14]]))).toThrow(/Twig emitted no token/);
    expect(() => twigRangesFromOracle(source, golden([['text', 0, '<p>'], ['print', 3], ['endPrint', 7], ['text', 10, '</p>'], ['end', 14]]))).toThrow(/Expected "}}"/);
  });
});

describe('compareWithHtmlOracle', () => {
  it('passes clean markup with Twig in text and attribute values', () => {
    const source = '<ul class="list {{ modifier }}" data-id=\'{{ id }}\'>\n  {% for item in items %}\n    <li>{{ item }}</li>\n  {% endfor %}\n</ul>';
    const tokens: CompactToken[] = [
      ['text', 0, '<ul class="list '], ['print', 16], ['endPrint', 28], ['text', 30, '" data-id=\''], ['print', 41], ['endPrint', 47],
      ['text', 49, '\'>\n  '], ['tag', 54], ['endTag', 75], ['text', 78, '    <li>'], ['print', 86], ['endPrint', 94],
      ['text', 96, '</li>\n  '], ['tag', 104], ['endTag', 114], ['text', 117, '</ul>'], ['end', 122],
    ];

    expect(oracleIssues(source, tokens)).toEqual([]);
  });

  it('passes Drupal attribute prints after a tag name and Twig inside a tag name', () => {
    const source = '<div{{ attributes }}><h{{ level }} class="a">t</h{{ level }}></div>';
    const tokens: CompactToken[] = [
      ['text', 0, '<div'], ['print', 4], ['endPrint', 18], ['text', 20, '><h'], ['print', 23], ['endPrint', 32],
      ['text', 34, ' class="a">t</h'], ['print', 49], ['endPrint', 58], ['text', 60, '></div>'], ['end', 67],
    ];

    expect(oracleIssues(source, tokens)).toEqual([]);
  });

  it('parses noscript content as markup, like a browser with scripting disabled', () => {
    const source = '<noscript><img src="a.png" alt=""></noscript>';

    expect(oracleIssues(source, plainHtml(source))).toEqual([]);
  });

  it('accepts a Twig tag read as an attribute of its own', () => {
    const source = '<span {% if x %}class="a"{% endif %}>t</span>';
    const tokens: CompactToken[] = [['text', 0, '<span '], ['tag', 6], ['endTag', 14], ['text', 16, 'class="a"'], ['tag', 25], ['endTag', 34], ['text', 36, '>t</span>'], ['end', 45]];

    expect(oracleIssues(source, tokens)).toEqual([]);
  });

  it('reports a Twig tag glued to an attribute name', () => {
    const source = '<span {% if x %}class="a"{% endif %}>t</span>';
    const tokens: CompactToken[] = [['text', 0, '<span '], ['tag', 6], ['endTag', 14], ['text', 16, 'class="a"'], ['tag', 25], ['endTag', 34], ['text', 36, '>t</span>'], ['end', 45]];

    expect(issuesForTreeWithoutTwigKinds(source, tokens)).toEqual([
      { check: 'html-oracle: attribute names', detail: 'line 1: oracle reads the name "class" in "{% if x %}class"' },
    ]);
  });

  it('reports a print and a Twig tag merged into one attribute', () => {
    const source = '<p {{ a }}{% if b %} id="c"{% endif %}>t</p>';
    const tokens: CompactToken[] = [['text', 0, '<p '], ['print', 3], ['endPrint', 8], ['tag', 10], ['endTag', 18], ['text', 20, ' id="c"'], ['tag', 27], ['endTag', 36], ['text', 38, '>t</p>'], ['end', 44]];

    expect(oracleIssues(source, tokens)).toEqual([]);
    expect(issuesForTreeWithoutTwigKinds(source, tokens)).toEqual([
      { check: 'html-oracle: attribute names', detail: 'line 1: attribute key glues a Twig tag to other content "{{ a }}{% if b %}"' },
    ]);
  });

  it('reports an end tag that is not the close of its element', () => {
    const source = '<html><head><span></head><body></body></html>';
    const { ast } = parseForESLint(source);

    expect(oracleIssues(source, plainHtml(source))).toEqual([]);
    expect(checksOf(compareWithHtmlOracle(source, [], withoutCloseOf(ast, 'head')))).toEqual(['html-oracle: implied end tags']);
  });

  it('reports a close tag with a Twig name that the parser does not pair', () => {
    const source = '<{{ element }} id="a">t</{{element}}>';
    const tokens: CompactToken[] = [['text', 0, '<'], ['print', 1], ['endPrint', 12], ['text', 14, ' id="a">t</'], ['print', 25], ['endPrint', 34], ['text', 36, '>'], ['end', 37]];
    const ranges = twigRangesFromOracle(source, golden(tokens));

    expect(oracleIssues(source, tokens)).toEqual([]);
    expect(compareWithHtmlOracle(source, ranges, withoutCloseOf(parseForESLint(source).ast, '{{ element }}')).map(({ check, detail }) => ({ check, detail }))).toEqual([
      { check: 'html-oracle: end tags', detail: 'line 1: end tag is not the close of any element "</{{element}}>"' },
    ]);
  });

  it('separates an element opened and closed in different Twig branches', () => {
    const source = '{% if u %}<a>{% else %}<div>{% endif %}x{% if u %}</a>{% else %}</div>{% endif %}';
    const tokens: CompactToken[] = [
      ['tag', 0], ['endTag', 8], ['text', 10, '<a>'], ['tag', 13], ['endTag', 21], ['text', 23, '<div>'], ['tag', 28], ['endTag', 37],
      ['text', 39, 'x'], ['tag', 40], ['endTag', 48], ['text', 50, '</a>'], ['tag', 54], ['endTag', 62], ['text', 64, '</div>'], ['tag', 70], ['endTag', 79], ['end', 81],
    ];

    expect(checksOf(oracleIssues(source, tokens))).toEqual(['html-oracle: element opened and closed in different Twig branches']);
  });

  it('separates stray end tags from dropped ones', () => {
    const source = '<div></div></div>';

    expect(oracleIssues(source, plainHtml(source))).toEqual([
      { check: 'html-oracle: unmatched end tags', detail: 'line 1: end tag is not the close of any element "</div>"' },
    ]);
  });

  it('reports tags parsed inside textarea content', () => {
    const source = '<textarea>\n<b>x</b></textarea>';

    expect(oracleIssues(source, plainHtml(source))).toEqual([]);
    expect(issuesForTreeWithoutTwigKinds(source, plainHtml(source))).toEqual([
      { check: 'html-oracle: raw text', detail: 'line 2: <b> is parsed as a tag inside raw text "<b>"' },
    ]);
  });

  it('reads a print glued to an attribute name as part of the name', () => {
    const source = '<div data-panes{{ attributes }}>t</div>';
    const tokens: CompactToken[] = [['text', 0, '<div data-panes'], ['print', 15], ['endPrint', 29], ['text', 31, '>t</div>'], ['end', 39]];

    expect(oracleIssues(source, tokens)).toEqual([]);
  });

  it('compares attribute names and value ranges by offset', () => {
    const source = '<a href="x" id=y>t</a>';
    const ast = {
      type: 'Program',
      body: [{
        type: 'Tag',
        name: 'a',
        range: [0, 22],
        openStart: { value: '<a', range: [0, 2] },
        openEnd: { value: '>', range: [16, 17] },
        close: { value: '</a>', range: [18, 22] },
        attributes: [
          { key: { value: 'href', range: [3, 7] }, value: { value: 'x"', range: [9, 11] } },
        ],
      }],
    };

    expect(checksOf(compareWithHtmlOracle(source, [], ast))).toEqual(['html-oracle: attribute values', 'html-oracle: attributes']);
  });

  it('reports an element the parser nests differently from the oracle', () => {
    const source = '<div><p>a</p><span>b</span></div>';
    const ast = parseForESLint(source).ast;
    const [div] = (ast.body[0] as unknown as { children: { children: { name: string }[] }[] }).children;
    const [paragraph, span] = div?.children ?? [];

    expect(checksOf(compareWithHtmlOracle(source, [], ast))).toEqual([]);
    Object.assign(paragraph ?? {}, { children: [...((paragraph as { children?: unknown[] }).children ?? []), span] });
    div?.children.pop();
    expect(checksOf(compareWithHtmlOracle(source, [], ast))).toEqual(['html-oracle: parents']);
  });

  it('gives each issue the range it covers and can lift the issue limit', () => {
    const source = `<textarea>${'\n<b></b>'.repeat(30)}</textarea>`;
    const ranges = twigRangesFromOracle(source, golden(plainHtml(source)));
    const ast = parseHtmlProgram(source, { templateInfos: [], rawContentTags: [] });

    expect(compareWithHtmlOracle(source, ranges, ast).every((issue) => issue.range !== undefined)).toBe(true);
    expect(compareWithHtmlOracle(source, ranges, ast, Infinity).length).toBeGreaterThan(compareWithHtmlOracle(source, ranges, ast).length);
  });

  it('de-duplicates identical issues', () => {
    const source = `<textarea>${'<b></b>'.repeat(30)}</textarea>`;

    expect(issuesForTreeWithoutTwigKinds(source, plainHtml(source))).toHaveLength(1);
  });

  it('bounds the issues for one template', () => {
    const source = `<textarea>${'\n<b></b>'.repeat(30)}</textarea>`;

    expect(issuesForTreeWithoutTwigKinds(source, plainHtml(source))).toHaveLength(20);
  });
});
