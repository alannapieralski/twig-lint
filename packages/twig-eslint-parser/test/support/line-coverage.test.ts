import { describe, expect, it } from 'vitest';
import { measureLineCoverage } from './line-coverage.js';
import type { TwigReading } from './line-coverage.js';

const ownLexer: TwigReading = { kind: 'own-lexer' };

function measure(source: string, reading: TwigReading = ownLexer) {
  return measureLineCoverage(source, reading);
}

describe('measureLineCoverage', () => {
  it('scores well-formed markup and Twig as fully parsed', () => {
    const coverage = measure('<ul>\n  {% for item in items %}\n    <li>{{ item }}</li>\n  {% endfor %}\n</ul>\n');

    expect(coverage.lineStatuses).toEqual({ parsed: 5, fault: 0, branchSplit: 0, templateDefect: 0 });
    expect(coverage.spans).toEqual([]);
  });

  it('does not count blank lines', () => {
    const coverage = measure('<p>one</p>\n\n   \n<p>two</p>\n');

    expect(coverage.countedLines).toBe(2);
  });

  it('marks every counted line when the template cannot be parsed', () => {
    const coverage = measure('{% endif %}\n<p>text</p>\n');

    expect(coverage.lineStatuses.fault).toBe(coverage.countedLines);
    expect(coverage.spans.map((span) => span.cause)).toEqual(['unparseable']);
  });

  it('files an unparseable template under template defects when Twig rejects it too', () => {
    const coverage = measure('{% endif %}\n<p>text</p>\n', { kind: 'rejected-by-twig' });

    expect(coverage.lineStatuses).toMatchObject({ fault: 0, templateDefect: coverage.countedLines });
  });

  it('marks the line of a Twig block that is not converted', () => {
    const coverage = measure('<p>a</p>\n{{ title upper }}\n<p>b</p>\n');

    expect(coverage.lineStatuses).toEqual({ parsed: 2, fault: 1, branchSplit: 0, templateDefect: 0 });
    expect(coverage.spans).toMatchObject([{ cause: 'twig-unconverted', startLine: 2, endLine: 2 }]);
  });

  it('counts a stray end tag as a template defect, not a fault', () => {
    const coverage = measure('<p>a</p>\n</div>\n<p>b</p>\n');

    expect(coverage.lineStatuses).toEqual({ parsed: 2, fault: 0, branchSplit: 0, templateDefect: 1 });
    expect(coverage.spans).toMatchObject([{ cause: 'template-defect', startLine: 2 }]);
  });

  it('keeps an element opened and closed in different Twig branches out of the faults', () => {
    const coverage = measure('{% if url %}<a href="{{ url }}">{% else %}<div>{% endif %}\nText\n{% if url %}</a>{% else %}</div>{% endif %}\n');

    expect(coverage.lineStatuses.fault).toBe(0);
    expect(coverage.lineStatuses.branchSplit).toBeGreaterThan(0);
  });

  it('files an element opened in both arms of a Twig branch and closed once under branch splits', () => {
    const coverage = measure('{% if nested %}\n  <ul class="a">\n{% else %}\n  <ul class="b">\n{% endif %}\n  <li>x</li>\n</ul>\n');

    expect(coverage.lineStatuses.fault).toBe(0);
    expect(coverage.causeLines['branch-split']).toBeGreaterThan(0);
  });

  it('reads a Twig tag between attributes the same way with and without the Twig oracle', () => {
    const coverage = measure('<button\n  type="x"\n  {% if a %}\n    data-text="y"\n  {% endif %}\n>t</button>\n');

    expect(coverage.lineStatuses.fault).toBe(0);
  });

  it('counts a line once, under the most serious cause', () => {
    const coverage = measure('<p>a</p>\n{{ title upper }}</div>\n');

    expect(coverage.lineStatuses).toEqual({ parsed: 1, fault: 1, branchSplit: 0, templateDefect: 0 });
    expect(coverage.causeLines).toEqual({ 'twig-unconverted': 1 });
  });

  it('merges neighbouring damage of one cause into a single span', () => {
    const coverage = measure('{{ a b }}\n{{ c d }}\n<p>fine</p>\n{{ e f }}\n');

    expect(coverage.spans.map(({ startLine, endLine }) => [startLine, endLine])).toEqual([[1, 2], [4, 4]]);
  });
});
