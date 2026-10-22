export const javascriptByTwigOperator: Readonly<Record<string, string>> = {
  'and': '&&',
  'or': '||',
  'xor': '^',
  'not': '!',
  'b-and': '&',
  'b-or': '|',
  'b-xor': '^',
  'in': '==',
  'not in': '!=',
  'matches': '==',
  'starts with': '==',
  'ends with': '==',
  'has some': ',',
  'has every': ',',
  '~': '+',
  '..': '+',
  '//': '/',
  '?:': '||',
  '? :': '||',
  '<=>': '==',
};

export const javascriptByTwigTestOperator: Readonly<Record<string, string>> = { 'is': '==', 'is not': '!=' };

export const twoWordTests: Readonly<Record<string, string>> = { same: 'as', divisible: 'by' };

export const expressionTags: ReadonlySet<string> = new Set(['if', 'elseif', 'do', 'macro', 'with']);

export const blockTags: ReadonlySet<string> = new Set([
  'apply', 'autoescape', 'block', 'cache', 'embed', 'for', 'guard', 'if', 'macro', 'sandbox', 'set', 'trans', 'verbatim', 'with',
]);

export const middleTags: ReadonlySet<string> = new Set(['else', 'elseif', 'plural']);

export const includeTags: ReadonlySet<string> = new Set(['include', 'embed']);

export const includeKeywordsToBlank: ReadonlySet<string> = new Set(['only', 'ignore', 'missing']);

export const twigDelimiters = /\{\{|\}\}|\{%|%\}|\{#|#\}/g;

export const convertedTags: ReadonlySet<string> = new Set(['set', 'block', 'for', ...expressionTags, ...includeTags]);

export const tagsLeftUnconverted: ReadonlySet<string> = new Set([
  'apply', 'autoescape', 'deprecated', 'extends', 'flush', 'from', 'guard', 'import', 'sandbox', 'types', 'use',
]);

export const reservedJavaScriptWords: ReadonlySet<string> = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum',
  'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'return', 'super',
  'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with',
]);
