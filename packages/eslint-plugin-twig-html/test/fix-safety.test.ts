import { readdirSync, readFileSync } from 'node:fs';
import { ESLint, type Linter } from 'eslint';
import { parseForESLint } from 'twig-eslint-parser';
import { describe, expect, it } from 'vitest';
import twigHtml from '../src/index.js';

const parserFixturesDirectory = new URL('../../twig-eslint-parser/test/fixtures/twig/', import.meta.url);
const parserFixtures = readdirSync(parserFixturesDirectory).filter((name) => name.endsWith('.twig')).sort();

const layoutRuleIds = ['twig-html/attrs-newline', 'twig-html/indent', 'twig-html/multiline-html-element-content-newline'];
const ruleIds = [...layoutRuleIds, 'twig-html/quotes'];
const withoutHtmlWhitespace = (text: string) => text.replace(/[ \t\n\r\f]+/g, '');

const rulesWithOnly = (ruleId: string, options?: Record<string, unknown>): Linter.RulesRecord => Object.fromEntries(ruleIds.map((id) => [id, id === ruleId ? ['warn', ...(options ? [options] : [])] : 'off']));

// Returns the code with HTML quotes dropped, Twig string delimiters marked and quote escapes inside Twig strings removed.
function withoutQuoting(code: string): string {
  const { strings } = parseForESLint(code).services.twig;
  const delimiters = new Set(strings.flatMap(({ range }) => [range[0], range[1] - 1]));
  const isInsideString = new Uint8Array(code.length);
  for (const { range } of strings) isInsideString.fill(1, range[0] + 1, range[1] - 1);

  let view = '';
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index] as string;
    const isQuote = character === "'" || character === '"';
    if (delimiters.has(index)) view += '§';
    else if (!isInsideString[index]) view += isQuote ? '' : character;
    else if (character !== '\\') view += character;
    else if (code[index + 1] === "'" || code[index + 1] === '"') continue;
    else {
      view += code.slice(index, index + 2);
      index += 1;
    }
  }
  return view;
}

function describeStrings(code: string) {
  const { strings } = parseForESLint(code).services.twig;
  return { count: strings.length, interpolated: strings.filter((string) => string.isInterpolated).length };
}

async function fixWithOnly(ruleId: string, fixtureName: string, options?: Record<string, unknown>) {
  const code = readFileSync(new URL(fixtureName, parserFixturesDirectory), 'utf8');
  const eslint = new ESLint({ overrideConfigFile: true, fix: true, overrideConfig: [twigHtml.configs.recommended, { files: ['**/*.twig'], rules: rulesWithOnly(ruleId, options) }] });
  const [result] = await eslint.lintText(code, { filePath: fixtureName });
  return { code, output: result?.output ?? code };
}

describe.each(layoutRuleIds)('%s --fix', (ruleId) => {
  it.each(parserFixtures)('only changes whitespace in %s, and the result still parses', async (fixtureName) => {
    const { code, output } = await fixWithOnly(ruleId, fixtureName);
    expect(withoutHtmlWhitespace(output)).toBe(withoutHtmlWhitespace(code));
    expect(() => parseForESLint(output)).not.toThrow();
    expect(parseForESLint(output).services.twig.diagnostics.length).toBe(parseForESLint(code).services.twig.diagnostics.length);
  });
});

describe.each([{}, { html: 'single', twig: 'double' }])('twig-html/quotes %j --fix', (options) => {
  it.each(parserFixtures)('only changes quoting in %s, and the result still parses', async (fixtureName) => {
    const { code, output } = await fixWithOnly('twig-html/quotes', fixtureName, options);
    expect(withoutQuoting(output)).toBe(withoutQuoting(code));
    expect(() => parseForESLint(output)).not.toThrow();
    expect(parseForESLint(output).services.twig.diagnostics.length).toBe(parseForESLint(code).services.twig.diagnostics.length);
    expect(describeStrings(output)).toEqual(describeStrings(code));
  });
});
