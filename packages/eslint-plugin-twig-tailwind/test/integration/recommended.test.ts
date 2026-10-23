import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { getDefaultSelectors } from 'eslint-plugin-better-tailwindcss/defaults';
import type { ParserOptions } from 'twig-eslint-parser';
import { describe, expect, it } from 'vitest';
import twigTailwind, { createConfig, twigSelectors, type ClassSelector } from '../../src/index.js';

const fixturesDirectory = fileURLToPath(new URL('../fixtures/', import.meta.url));

type LintSetup = { parserOptions?: ParserOptions; selectors?: readonly unknown[]; extraSelectors?: readonly ClassSelector[]; rules?: Linter.RulesRecord; fix?: boolean; withDrupal?: boolean };

function linterOptions({ parserOptions, selectors, extraSelectors = [], rules = {}, fix = false, withDrupal = true }: LintSetup): ESLint.Options {
  return {
    cwd: fixturesDirectory,
    fix,
    overrideConfigFile: true,
    overrideConfig: [
      createConfig({ drupal: withDrupal, selectors: extraSelectors }),
      {
        files: ['**/*.twig'],
        ...(parserOptions && { languageOptions: { parserOptions } }),
        settings: { 'better-tailwindcss': { entryPoint: 'tailwind/theme.css', ...(selectors && { selectors }) } },
        rules,
      },
    ],
  };
}

async function lint(code: string, setup: LintSetup = {}) {
  const [result] = await new ESLint(linterOptions(setup)).lintText(code, { filePath: `${fixturesDirectory}/template.html.twig` });
  if (!result) throw new Error('ESLint returned no result.');
  return result;
}

function columnOf(code: string, text: string): number {
  return code.indexOf(text) + 1;
}

function unknownClassAt(code: string, className: string): string {
  return `1:${columnOf(code, className)} better-tailwindcss/no-unknown-classes Unknown class detected: ${className}`;
}

function describeMessages(messages: { ruleId: string | null; line: number; column: number; message: string }[]): string[] {
  return messages.map((message) => `${message.line}:${message.column} ${message.ruleId} ${message.message.split('\n')[0]}`);
}

describe('createConfig({ drupal: true })', () => {
  it.each([
    ['{% set classes %} arrays', "{% set classes = ['gap-fl-sm', 'nope'] %}"],
    ['{% set grid_classes %} arrays', "{% set grid_classes = ['gap-fl-sm', 'nope'] %}"],
    ['addClass() inside <tag{{ attributes }}>', "<div{{ attributes.addClass(['mt-fl-sm', 'nope']) }}>x</div>"],
    ['removeClass()', "<div{{ attributes.removeClass('nope') }}>x</div>"],
    ['a chained addClass()', "<div{{ attributes.addClass(classes).addClass(['mt-fl-sm', 'nope']) }}>x</div>"],
    ['removeClass() chained after addClass()', "{% set image = attributes.addClass('mt-fl-sm').removeClass('nope') %}"],
    ['a short ternary in {% set classes %}', "{% set classes = ['gap-fl-sm', active ? 'nope'] %}"],
    ['a short ternary in addClass()', "<div{{ attributes.addClass([count == 1 ? 'nope']) }}>x</div>"],
    ['create_attribute() with an array', "{% set image = create_attribute({'class': ['size-full', 'nope']}) %}"],
    ['create_attribute() with a string', "{% set image = create_attribute({'class': 'nope size-full'}) %}"],
    ['{% include with { classes } %} arrays', "{% include 'numiko:card' with { classes: ['w-full', 'nope'] } only %}"],
    ['{% embed with { classes } %} strings', "{% embed 'numiko:card' with { classes: 'nope w-full' } %}{% endembed %}"],
    ['include() function calls', "{{ include('numiko:card', { classes: ['w-full', 'nope'] }) }}"],
  ])('reports an unknown class in %s at its exact position', async (_, code) => {
    const result = await lint(code);
    expect(describeMessages(result.messages)).toEqual([unknownClassAt(code, 'nope')]);
  });

  it('reports conflicting classes in a plain class attribute', async () => {
    const result = await lint('<p class="p-2 p-4">x</p>');
    expect(result.messages.map((message) => message.ruleId)).toEqual([
      'better-tailwindcss/no-conflicting-classes',
      'better-tailwindcss/no-conflicting-classes',
    ]);
  });

  it.each([
    ['{% set classes %}', "{% set classes = ['nope'] %}"],
    ['a variable ending in _class', "{% set title_class = 'nope' %}"],
    ['a camelCase variable ending in Class', "{% set bgColorClass = 'nope' %}"],
    ['an include key ending in _classes', "{% include 'x' with { wrapper_classes: 'nope' } %}"],
    ['a camelCase include key ending in Class', "{% include 'x' with { wrapperClass: 'nope' } %}"],
    ['a merge into a camelCase classes variable', "{% set bgClasses = bgClasses|merge(['nope']) %}"],
    ['a class key nested in an include hash', "{% include 'x' with { attrs: { class: 'nope' } } %}"],
    ['the class key of any function', "{{ icon('arrow', { class: ['nope'] }) }}"],
    ['create_attribute()', "{% set image = create_attribute({'class': ['nope']}) %}"],
  ])('lints %s without the drupal option', async (_, code) => {
    const result = await lint(code, { withDrupal: false });
    expect(describeMessages(result.messages)).toEqual([unknownClassAt(code, 'nope')]);
  });

  it.each([
    ['{% set style %}', "{% set style = 'nope' %}"],
    ['a non-class include key', "{% include 'x' with { variant: 'nope' } %}"],
  ])('leaves %s alone', async (_, code) => {
    const result = await lint(code);
    expect(result.messages).toEqual([]);
  });

  it('lints classes added with |merge to a classes variable, and nothing else merged', async () => {
    const code = "{% set classes = classes|merge(['nope']) %}{% set items = items|merge(['skipped']) %}";
    const result = await lint(code, { withDrupal: false });
    expect(describeMessages(result.messages)).toEqual([unknownClassAt(code, 'nope')]);
  });

  it('leaves addClass() alone without the drupal option', async () => {
    const result = await lint("<div{{ attributes.addClass('nope') }}>x</div>", { withDrupal: false });
    expect(result.messages).toEqual([]);
  });

  it('adds the selectors option to the built-in selectors', async () => {
    const code = "{{ pattern('nope') }}{% set classes = ['nope2'] %}";
    const result = await lint(code, { withDrupal: false, extraSelectors: [{ kind: 'callee', name: '^pattern$', match: [{ type: 'strings' }] }] });
    expect(describeMessages(result.messages)).toEqual([unknownClassAt(code, 'nope'), unknownClassAt(code, 'nope2')]);
  });

  it.each([
    ['an unknown option', { drupl: true }],
    ['a drupal option that is not a boolean', { drupal: 'yes' }],
    ['a selectors option that is not an array', { selectors: {} }],
    ['a selectors option holding a non-selector', { selectors: ['^pattern$'] }],
    ['a callee selector with neither name nor path', { selectors: [{ kind: 'callee', match: [{ type: 'strings' }] }] }],
    ['a variable selector with only a path', { selectors: [{ kind: 'variable', path: '^x$' }] }],
    ['a selector whose name is not a string', { selectors: [{ kind: 'callee', name: /^x$/ }] }],
    ['a selector whose match is not an array', { selectors: [{ kind: 'callee', name: '^x$', match: 'strings' }] }],
    ['a selector whose matcher is a bare string', { selectors: [{ kind: 'callee', name: '^x$', match: ['strings'] }] }],
    ['a selector whose matcher has an unknown type', { selectors: [{ kind: 'callee', name: '^x$', match: [{ type: 'values' }] }] }],
    ['a selector whose matcher path is not a string', { selectors: [{ kind: 'callee', name: '^x$', match: [{ type: 'objectValues', path: 1 }] }] }],
    ['a selector whose name is not a valid regular expression', { selectors: [{ kind: 'callee', name: '[' }] }],
    ['a selector whose matcher path is not a valid regular expression', { selectors: [{ kind: 'callee', name: '^x$', match: [{ type: 'objectValues', path: '(' }] }] }],
  ])('throws on %s', (_, options) => {
    expect(() => createConfig(options as never)).toThrow(TypeError);
  });

  it('accepts a selector with an anonymousFunctionReturn matcher', () => {
    expect(() => createConfig({ selectors: [{ kind: 'callee', name: '^x$', match: [{ type: 'anonymousFunctionReturn', match: [{ type: 'strings' }] }] }] })).not.toThrow();
  });

  it('names the config after the drupal option', () => {
    expect([createConfig().name, createConfig({ drupal: true }).name]).toEqual(['twig-tailwind/recommended', 'twig-tailwind/drupal']);
  });

  it('keeps configs.recommended and configs.drupal as built configs', () => {
    expect(twigTailwind.configs).toEqual({ recommended: createConfig(), drupal: createConfig({ drupal: true }) });
  });

  it('lets a later selectors setting replace the Drupal selectors', async () => {
    const code = "<div{{ attributes.addClass('nope') }}>x</div>{% set classes = ['nope2'] %}";
    const result = await lint(code, { selectors: [...getDefaultSelectors(), ...twigSelectors] });
    expect(describeMessages(result.messages)).toEqual([unknownClassAt(code, 'nope2')]);
  });

  it('autofixes class order inside a Twig string without touching anything else', async () => {
    const code = "<span{{ attributes.addClass('text-surface-primary-accent shrink-0 mt-1') }}>y</span>";
    const result = await lint(code, { fix: true });
    expect(result.output).toBe("<span{{ attributes.addClass('mt-1 shrink-0 text-surface-primary-accent') }}>y</span>");
  });

  it.each([
    ['a {% set %} array', "{% set classes = ['mt-1 flex w-full shrink-0', 'items-center justify-center gap-4 overflow-hidden p-6 text-left'] %}"],
    ['an addClass() argument', "<div{{ attributes.addClass('mt-1 flex w-full shrink-0 items-center justify-center gap-4 overflow-hidden p-6 text-left') }}></div>"],
  ])('leaves a long class string in %s on one line, since line wrapping only applies to class=""', async (_, code) => {
    const result = await lint(code, { fix: true });
    expect(result.output ?? code).toBe(code);
  });

  it('still wraps a long class="" attribute across lines', async () => {
    const code = '<p class="mt-1 flex w-full shrink-0 items-center justify-center gap-4 overflow-hidden p-6 text-left">x</p>';
    const result = await lint(code, { fix: true });
    expect(result.output).toBe('<p class="\n  mt-1 flex w-full shrink-0 items-center justify-center gap-4 overflow-hidden\n  p-6 text-left\n">x</p>');
  });
});

describe('interpolated strings ("#{ }")', () => {
  const betterTailwindcssMessages = (messages: { ruleId: string | null }[]) => messages.filter((message) => message.ruleId?.startsWith('better-tailwindcss/'));
  const interpolated = '{% set classes = "flex #{modifier} p-4 items-center" %}';

  it('silences better-tailwindcss inside them, so --fix cannot scramble the interpolation', async () => {
    const result = await lint(interpolated, { fix: true });
    expect(result.output ?? interpolated).toBe(interpolated);
    expect(betterTailwindcssMessages(result.messages)).toEqual([]);
  });

  it.each([
    ['U+2028', '\u2028'],
    ['U+2029', '\u2029'],
    ['a lone \\r', '\r'],
  ])('silences them after a %s line break, which ESLint counts as a new line', async (_, lineBreak) => {
    const code = `<p>Intro${lineBreak}more</p>\n${interpolated}`;
    const result = await lint(code, { fix: true });
    expect(result.output ?? code).toBe(code);
    expect(betterTailwindcssMessages(result.messages)).toEqual([]);
  });

  it('keeps linting and fixing every other string in the same file', async () => {
    const code = `${interpolated}\n<span{{ attributes.addClass('shrink-0 mt-1') }}>y</span>`;
    const result = await lint(code, { fix: true });
    expect(result.output).toBe(`${interpolated}\n<span{{ attributes.addClass('mt-1 shrink-0') }}>y</span>`);
  });
});

describe('twig-tailwind/no-twig-interpolation', () => {
  it('reports Twig inside class="" once, while better-tailwindcss stays quiet about the {{ }} fragments', async () => {
    const code = '<p class="region--{{ region }}__inner flex {{ extra }}">x</p>';
    const result = await lint(code);
    expect(describeMessages(result.messages)).toEqual([
      `1:${columnOf(code, 'class=')} twig-tailwind/no-twig-interpolation Avoid Twig inside class="": linters cannot see what it produces. Build the value with {% set classes = [...] %} and attributes.addClass(), or pass it to an include as { classes: [...] }.`,
    ]);
  });

  it('reports Twig statements inside class="" too', async () => {
    const result = await lint('<p class="flex {% if active %}font-bold{% endif %}">x</p>');
    expect(result.messages.map((message) => message.ruleId)).toEqual(['twig-tailwind/no-twig-interpolation']);
  });

  it('also reports when the parser keeps interpolated attributes in the HTML AST', async () => {
    const result = await lint('<p class="flex {{ extra }}">x</p>', { parserOptions: { ignoreInterpolatedAttributes: [] } });
    expect(result.messages.map((message) => message.ruleId)).toContain('twig-tailwind/no-twig-interpolation');
  });

  it('reports a Twig string that interpolates with #{ }, but not one that does not', async () => {
    const code = `{% set classes = ['flex', "card--#{variant}"] %}\n{% set other = ['flex', 'p-4'] %}`;
    const result = await lint(code);
    expect(describeMessages(result.messages)).toEqual([
      `1:${columnOf(code, '"card')} twig-tailwind/no-twig-interpolation Avoid #{ } inside a Twig string: linters cannot see what it produces, so the classes in it are not checked. Build the value with an array such as ['flex', modifier] instead.`,
    ]);
  });

  it('leaves other attributes alone by default', async () => {
    const result = await lint('<a href="{{ url }}" class="flex">x</a>');
    expect(result.messages).toEqual([]);
  });

  it('checks any attributes listed in its options', async () => {
    const result = await lint('<a href="{{ url }}" class="flex {{ extra }}">x</a>', { rules: { 'twig-tailwind/no-twig-interpolation': ['error', { attributes: ['href'] }] } });
    expect(result.messages.map((message) => message.message.split(':')[0])).toEqual(['Avoid Twig inside href=""']);
  });

  it('does not report the Twig-built class attributes the option hides when the rule is off', async () => {
    const result = await lint('<p class="flex {{ extra }}">x</p>', { rules: { 'twig-tailwind/no-twig-interpolation': 'off' } });
    expect(result.messages).toEqual([]);
  });
});

describe('twig-tailwind/no-unparsed-twig', () => {
  it('reports a Twig block the parser could not read at its position', async () => {
    const code = '<p>\n  {{ a b c }}\n</p>';
    const result = await lint(code);
    expect(describeMessages(result.messages)).toEqual([
      '2:3 twig-tailwind/no-unparsed-twig This Twig block could not be parsed (Unexpected token b), so nothing inside it is linted. Check the expression is valid Twig.',
    ]);
  });

  it('stays quiet about valid Twig that mixes ?? with and', async () => {
    const result = await lint("{% set classes = [modifier ?? 'w-full' and active ? 'flex'] %}");
    expect(result.messages).toEqual([]);
  });
});
