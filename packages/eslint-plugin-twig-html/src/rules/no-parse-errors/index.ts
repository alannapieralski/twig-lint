import type { Rule } from 'eslint';
import { readTwigServices } from 'twig-eslint-parser';
import { docsUrlFor } from '../../shared/docs-url.js';
import { reportProblems } from '../../shared/report-problems.js';
import { findParseErrorProblems } from './find-parse-error-problems.js';
import { messages } from './messages.js';
import { optionsSchema, resolveOptions } from './options.js';

export const noParseErrors: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Report markup and Twig the parser read past but that a browser or Twig would treat as an error',
      url: docsUrlFor('no-parse-errors'),
    },
    schema: [optionsSchema],
    messages,
  },

  create(context) {
    const options = resolveOptions(context.options[0]);
    const { diagnostics } = readTwigServices(context.sourceCode, context.id);

    return { Program: () => reportProblems(context, findParseErrorProblems(diagnostics, options)) };
  },
};
