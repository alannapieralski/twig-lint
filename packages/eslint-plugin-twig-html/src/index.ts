import { createRequire } from 'node:module';
import type { ESLint, Linter } from 'eslint';
import twigParser from 'twig-eslint-parser';
import { attrsNewline } from './rules/attrs-newline/index.js';
import { indent } from './rules/indent/index.js';
import { multilineHtmlElementContentNewline } from './rules/multiline-html-element-content-newline/index.js';
import { noParseErrors } from './rules/no-parse-errors/index.js';
import { quotes } from './rules/quotes/index.js';

const { name, version } = createRequire(import.meta.url)('../package.json') as { name: string; version: string };

const plugin = {
  meta: { name, version },
  rules: {
    'attrs-newline': attrsNewline,
    indent,
    'multiline-html-element-content-newline': multilineHtmlElementContentNewline,
    'no-parse-errors': noParseErrors,
    quotes,
  },
  configs: {} as { recommended: Linter.Config },
} satisfies ESLint.Plugin;

const recommended: Linter.Config = {
  name: 'twig-html/recommended',
  files: ['**/*.twig'],
  ignores: ['**/*.svg.twig'],
  plugins: { 'twig-html': plugin },
  languageOptions: { parser: twigParser },
  rules: {
    'twig-html/attrs-newline': 'warn',
    'twig-html/indent': 'warn',
    'twig-html/multiline-html-element-content-newline': 'warn',
    'twig-html/no-parse-errors': 'warn',
    'twig-html/quotes': 'warn',
  },
};

Object.assign(plugin.configs, { recommended });

export default plugin;
