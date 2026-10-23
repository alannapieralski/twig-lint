import type { Rule } from 'eslint';
import { readTwigServices } from 'twig-eslint-parser';
import { docsUrlFor } from '../../shared/docs-url.js';
import { skippedElements } from '../../shared/html-elements.js';
import { createIgnoredInsideCheck } from '../../shared/ignored-inside.js';
import { reportProblems } from '../../shared/report-problems.js';
import { findUnsoundTagStarts } from '../../shared/unsound-open-tags.js';
import { createAttributesOf } from '../../shared/tag-attributes.js';
import { tagListeners } from '../../shared/tag-listeners.js';
import { tagNodeTypes } from '../../shared/tag-node.js';
import { findTagProblems } from './find-tag-problems.js';
import { findTwigStringProblems } from './find-twig-string-problems.js';
import { messages } from './messages.js';
import { optionsSchema, resolveOptions } from './options.js';
import { quotesFor } from './quote-style.js';
import type { TagWithAttributes } from './types.js';

export const quotes: Rule.RuleModule = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Enforce one quote style for HTML attribute values and another for Twig strings',
      url: docsUrlFor('quotes'),
    },
    fixable: 'code',
    schema: [optionsSchema],
    messages,
  },

  create(context) {
    const options = resolveOptions(context.options[0]);
    const { sourceCode } = context;
    const { blocks, strings, omittedAttributes, diagnostics } = readTwigServices(sourceCode, context.id);
    const source = { text: sourceCode.text, blocks, unsoundTagStarts: findUnsoundTagStarts(diagnostics), ...quotesFor(options) };
    const attributesOf = createAttributesOf(omittedAttributes);
    const isSkipped = createIgnoredInsideCheck(sourceCode, skippedElements);

    const checkTag = (tag: TagWithAttributes) => reportProblems(context, findTagProblems(tag, attributesOf, source, isSkipped));

    return {
      Program: () => reportProblems(context, findTwigStringProblems(strings, source)),
      ...tagListeners(checkTag, tagNodeTypes),
    };
  },
};
