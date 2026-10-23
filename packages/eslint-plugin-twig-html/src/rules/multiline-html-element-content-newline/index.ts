import type { Rule } from 'eslint';
import { readTwigServices } from 'twig-eslint-parser';
import { docsUrlFor } from '../../shared/docs-url.js';
import { reportProblems } from '../../shared/report-problems.js';
import { balancedTagListeners } from '../../shared/tag-listeners.js';
import type { TagNode } from '../../shared/tag-node.js';
import { createTagSource } from '../../shared/tag-source.js';
import { findContentProblems } from './find-content-problems.js';
import { messages } from './messages.js';
import { optionsSchema, resolveOptions, resolveSkippedElements } from './options.js';

export const multilineHtmlElementContentNewline: Rule.RuleModule = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Require a line break before and after the content of a multi-line element',
      url: docsUrlFor('multiline-html-element-content-newline'),
    },
    fixable: 'whitespace',
    schema: [optionsSchema],
    messages,
  },

  create(context) {
    const options = resolveOptions(context.options[0]);
    const services = readTwigServices(context.sourceCode, context.id);
    const source = createTagSource(context.sourceCode, services, resolveSkippedElements(options));

    const checkTag = (tag: TagNode) => reportProblems(context, findContentProblems(tag, source, options));

    return balancedTagListeners(checkTag, ['Tag'], services.blocks);
  },
};
