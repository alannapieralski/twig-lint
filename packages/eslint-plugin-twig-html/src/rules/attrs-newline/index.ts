import type { Rule } from 'eslint';
import { readTwigServices } from 'twig-eslint-parser';
import { skippedElements } from '../../shared/html-elements.js';
import { docsUrlFor } from '../../shared/docs-url.js';
import { reportProblems } from '../../shared/report-problems.js';
import { balancedTagListeners } from '../../shared/tag-listeners.js';
import { tagNodeTypes, type TagNode } from '../../shared/tag-node.js';
import { createTagSource } from '../../shared/tag-source.js';
import { findAttributeProblems } from './find-attribute-problems.js';
import { messages } from './messages.js';
import { optionsSchema, resolveOptions } from './options.js';

export const attrsNewline: Rule.RuleModule = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Put each attribute of a tag with many attributes on its own line',
      url: docsUrlFor('attrs-newline'),
    },
    fixable: 'whitespace',
    schema: [optionsSchema],
    messages,
  },

  create(context) {
    const options = resolveOptions(context.options[0]);
    const services = readTwigServices(context.sourceCode, context.id);
    const source = createTagSource(context.sourceCode, services, [...skippedElements, ...options.ignores]);

    const checkTag = (tag: TagNode) => reportProblems(context, findAttributeProblems(tag, source, options));

    return balancedTagListeners(checkTag, tagNodeTypes, services.blocks);
  },
};
