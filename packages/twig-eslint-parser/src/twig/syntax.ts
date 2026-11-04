export const TESTS_WITH_ONE_MANDATORY_ARGUMENT: ReadonlySet<string> = new Set(['divisible by', 'same as']);

export const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'apply', 'autoescape', 'block', 'cache', 'embed', 'for', 'guard', 'if', 'macro', 'sandbox', 'set', 'trans', 'verbatim', 'with',
]);

export const MIDDLE_TAGS: ReadonlySet<string> = new Set(['else', 'elseif', 'plural']);

export const PARENTS_OF_MIDDLE_TAG: Readonly<Record<string, ReadonlySet<string>>> = {
  else: new Set(['if', 'for', 'guard']),
  elseif: new Set(['if']),
  plural: new Set(['trans']),
};

export const TAGS_THAT_CANNOT_FOLLOW_ELSE: ReadonlySet<string> = new Set(['else', 'elseif']);

export const TAGS_WITH_VARYING_MARKUP: ReadonlySet<string> = new Set(['if', 'for', 'guard', 'trans', 'verbatim']);

export const TWIG_DELIMITERS = /\{\{|\}\}|\{%|%\}|\{#|#\}/g;

export const TAGS_LEFT_UNCONVERTED: ReadonlySet<string> = new Set([
  'apply', 'autoescape', 'deprecated', 'extends', 'flush', 'from', 'guard', 'import', 'sandbox', 'types', 'use',
]);
