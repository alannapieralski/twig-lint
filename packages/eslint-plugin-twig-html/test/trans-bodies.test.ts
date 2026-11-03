import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import twigHtml from '../src/index.js';

async function fixed(code: string): Promise<string> {
  const eslint = new ESLint({ overrideConfigFile: true, fix: true, overrideConfig: [twigHtml.configs.recommended] });
  const [result] = await eslint.lintText(code, { filePath: 'template.html.twig' });
  if (!result) {
    throw new Error('ESLint returned no result.');
  }
  return result.output ?? code;
}

const BODY = "  <p class='a'>The election on {{ date }} has been cancelled.</p>\n  <p>This can happen\n      for a number of reasons.</p>\n  <p class=\"one\" id=\"two\" data-x=\"three\" data-y=\"four\">Four attributes</p>";

describe('a {% trans %} body, whose text is the translation key', () => {
  it('is left exactly as written by every rule', async () => {
    const output = await fixed(`<div>\n{% trans %}\n${BODY}\n{% endtrans %}\n</div>\n`);

    expect(output).toContain(`{% trans %}\n${BODY}\n`);
  });

  it('keeps both bodies of a trans with a plural exactly as written', async () => {
    const pluralBody = "  <p class='b'>@count items</p>";
    const output = await fixed(`<div>\n{% trans %}\n${BODY}\n{% plural count %}\n${pluralBody}\n{% endtrans %}\n</div>\n`);

    expect(output).toContain(`{% trans %}\n${BODY}\n`);
    expect(output).toContain(`{% plural count %}\n${pluralBody}\n`);
  });

  it('still indents the trans tags, the plural tag and everything around the body', async () => {
    const output = await fixed('<div>\n<p>\n{% trans %}\nText\n{% plural count %}\nPlural\n{% endtrans %}\n</p>\n</div>\n');

    expect(output).toBe('<div>\n  <p>\n    {% trans %}\nText\n    {% plural count %}\nPlural\n    {% endtrans %}\n  </p>\n</div>\n');
  });

  it('is fixed like any other markup once it sits outside a trans', async () => {
    const output = await fixed(`<div>\n${BODY}\n</div>\n`);

    expect(output).toContain('  <p class="a">The election');
    expect(output).toContain('    class="one"');
  });

  it('does not stop the rules from fixing an element that holds a trans', async () => {
    const output = await fixed("<div class='a' id='b' data-c='d'>{% trans %}Hello{% endtrans %}</div>\n");

    expect(output).toBe('<div\n  class="a"\n  id="b"\n  data-c="d"\n>\n  {% trans %}Hello{% endtrans %}\n</div>\n');
  });

  it('does not treat the one-line trans form as a body', async () => {
    const output = await fixed("<div>\n<p class='a'>{% trans 'Hello' %}</p>\n</div>\n");

    expect(output).toBe('<div>\n  <p class="a">{% trans \'Hello\' %}</p>\n</div>\n');
  });
});
