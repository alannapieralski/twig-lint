import { describe, expect, it } from 'vitest';
import { parseForESLint } from '../../src/index.js';
import { TEMPLATE_DEFECT_CHECKS, checkParserOutput } from './output-checks.js';
import type { ParseForOutputChecks } from './output-checks.js';

type Mutable = Record<string, unknown>;

function tagsIn(value: unknown, found: Mutable[] = []): Mutable[] {
  if (typeof value !== 'object' || value === null) {
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((child) => tagsIn(child, found));
    return found;
  }
  const node = value as Mutable;
  if (node['type'] === 'Tag') {
    found.push(node);
  }
  for (const [key, child] of Object.entries(node)) {
    if (key !== 'parent') {
      tagsIn(child, found);
    }
  }
  return found;
}

function parseAndBreak(breakTree: (tags: Mutable[]) => void): ParseForOutputChecks {
  return (code, options) => {
    const result = parseForESLint(code, options);
    breakTree(tagsIn(result.ast.body));
    return result;
  };
}

const dropCloseOf = (name: string) => parseAndBreak((tags) => tags.filter((tag) => tag['name'] === name).forEach((tag) => delete tag['close']));

function checksOf(code: string): string[] {
  return checkParserOutput(code).map((issue) => issue.check);
}

function parserFailuresOf(code: string): string[] {
  return checksOf(code).filter((check) => !TEMPLATE_DEFECT_CHECKS.has(check));
}

describe('checkParserOutput', () => {
  it.each([
    ['a comment opener inside a script string', '<script>var a = "<!--";</script><p class="x">y</p>'],
    ['a comment opener inside an attribute value', '<p title="<!--" class="x">y</p><p class="z">w</p>'],
    ['a class attribute inside a closed comment', '<!-- <p class="x"> --><p class="y">w</p>'],
    ['a class attribute inside raw text', '<textarea><p class="x"></textarea><p class="y">w</p>'],
    ['a script close tag inside a comment before the script', '<!-- </script> --><script>var a = \'<p class="x">\';</script><p class="y">w</p>'],
  ])('counts class attributes as HTML reads them with %s', (_name, code) => {
    expect(checkParserOutput(code).map((issue) => issue.check)).not.toContain('html: every class attribute is read');
  });

  it('reports the line of the first class attribute the parser did not read', () => {
    const dropSecondTagAttributes = parseAndBreak((tags) => {
      const second = tags[1];
      if (second) {
        second['attributes'] = [];
      }
    });
    const issues = checkParserOutput('<ul class="a">\n  <li class="b">x</li>\n</ul>', dropSecondTagAttributes);
    expect(issues.filter((issue) => issue.check === 'html: every class attribute is read')).toEqual([
      expect.objectContaining({ detail: 'found 1, markup has 2', line: 2 }),
    ]);
  });

  it('finds nothing wrong with well-formed markup and Twig', () => {
    expect(checkParserOutput('<div class="a {{ b }}" id=x {# note #} data-y>\n  {% if c %}<p>{{ c }}</p>{% endif %}<br>\n</div>')).toEqual([]);
  });

  it('reports a template the parser rejects as a template defect with its line', () => {
    expect(checkParserOutput('<p>\n<div class="a"\n<p>')).toEqual([
      expect.objectContaining({ check: 'template is valid Twig and HTML', line: 3 }),
    ]);
  });

  it('reads Drupal placeholders and dynamic tag names without losing a close tag', () => {
    expect(parserFailuresOf('<html><head><head-placeholder token="x"></head><body></body></html>')).toEqual([]);
    expect(parserFailuresOf('<{{ element }}>a</{{element}}>')).toEqual([]);
  });

  it('fails a close tag that the parser drops while its element is still open', () => {
    const failures = checkParserOutput('<html><head><title>t</title></head></html>', dropCloseOf('head')).map((issue) => issue.check);
    expect(failures).toContain('html: close tag is read');
  });

  it('fails a dynamic close tag the parser cannot pair', () => {
    const failures = checkParserOutput('<{{ element }}>a</{{element}}>', dropCloseOf('{{ element }}')).map((issue) => issue.check);
    expect(failures).toContain('html: close tag is read');
  });

  it('reports an element opened in one Twig branch and closed in another as a known limitation', () => {
    const code = '{% if url %}<a href="{{ url }}">{% else %}<div>{% endif %}x{% if url %}</a>{% else %}</div>{% endif %}';
    expect(checksOf(code)).toContain('html: element opened and closed in different Twig branches');
    expect(parserFailuresOf(code)).toEqual([]);
  });

  it('reports a close tag that closes nothing as a template defect', () => {
    expect(checksOf('<div></div></span>')).toEqual(['html: stray close tag']);
  });

  it('reports only the innermost element left open', () => {
    const issues = checkParserOutput('<section><div><span>a</div></section>').filter((issue) => issue.check === 'html: element closes');
    expect(issues.map((issue) => issue.detail)).toEqual(['line 1: <span']);
  });

  it('reads a Twig tag after an attribute name as an attribute of its own', () => {
    expect(parserFailuresOf('<input type="checkbox"{% if checked %} checked{% endif %}>')).toEqual([]);
  });

  it('fails a Twig tag glued into an attribute name', () => {
    const glueFirstTwoAttributes = parseAndBreak(([input]) => {
      const [first, second, ...rest] = (input?.['attributes'] as Mutable[] | undefined) ?? [];
      const firstKey = first?.['key'] as Mutable;
      const secondKey = second?.['key'] as Mutable;
      firstKey['value'] = `${String(firstKey['value'])}${String(secondKey['value'])}`;
      (input as Mutable)['attributes'] = [first, ...rest];
    });
    const failures = checkParserOutput('<input {% if checked %}checked{% endif %}>', glueFirstTwoAttributes).map((issue) => issue.check);
    expect(failures).toContain('html: Twig block glued to a name');
  });

  it('accepts a Twig print that is part of an attribute name', () => {
    expect(checkParserOutput('<div data-{{ name }}="x"></div>')).toEqual([]);
  });

  it('keeps Twig delimiters inside verbatim out of the coverage check', () => {
    expect(checkParserOutput('{% verbatim %}<p>{{ raw }}</p>{% endverbatim %}')).toEqual([]);
  });
});
