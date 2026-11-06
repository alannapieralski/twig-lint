import { describe, expect, it } from 'vitest';
import { parseForESLint, TwigSyntaxError } from '../../src/index.js';

const PIECES = [
  'a', 'b', '1', '"s"', '"x#{y}"', "'q'", '(', ')', '[', ']', '{', '}', ',', ':', '.', '?', '?.', '|', '=>', '=',
  'not', 'and', 'in', 'is', 'is not', 'not in', '..', '~', '+', '-', '...', 'same as', 'divisible by', 'only',
  'with', 'ignore', 'missing', '?:', '??', '"', '#{', '\\', 'if', 'for', 'set', 'macro', 'is defined', 'starts with',
  'has some', 'constructor', 'toString',
];

const WRAPPERS: readonly ((expression: string) => string)[] = [
  (expression) => `{{ ${expression} }}`,
  (expression) => `{% if ${expression} %}{% endif %}`,
  (expression) => `{% set ${expression} %}`,
  (expression) => `{% for ${expression} %}{% endfor %}`,
  (expression) => `{% macro ${expression} %}{% endmacro %}`,
  (expression) => `{% include ${expression} %}`,
  (expression) => `{% with ${expression} %}{% endwith %}`,
  (expression) => `{% block ${expression} %}x{% endblock %}`,
];

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] as T;
}

function buildTemplate(random: () => number): string {
  const length = 1 + Math.floor(random() * 9);
  const expression = Array.from({ length }, () => pick(PIECES, random)).join(' ');
  return pick(WRAPPERS, random)(expression);
}

describe('the Twig grammar on random token soup', () => {
  it('either parses a block or reports it, and never throws anything but a TwigSyntaxError', () => {
    const random = createRandom(12345);
    const failures: string[] = [];

    for (let run = 0; run < 5000; run += 1) {
      const code = buildTemplate(random);
      try {
        const { ast, services } = parseForESLint(code);
        const { convertedBlockCount, ignoredBlockCount, blocks } = services.twig;
        const unparsedCount = services.twig.diagnostics.filter((diagnostic) => diagnostic.code === 'x-unparsed-twig').length;
        const statementsAreNodes = (ast.twigBody as unknown as { type?: unknown }[]).every((statement) => typeof statement.type === 'string');
        if (convertedBlockCount + ignoredBlockCount + unparsedCount !== blocks.length || !statementsAreNodes) {
          failures.push(code);
        }
      } catch (error) {
        if (!(error instanceof TwigSyntaxError)) {
          failures.push(`${code} threw ${String(error)}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
