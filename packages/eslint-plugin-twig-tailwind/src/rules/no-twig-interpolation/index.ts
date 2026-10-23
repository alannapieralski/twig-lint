import type { Rule } from 'eslint';
import { readTwigServices } from 'twig-eslint-parser';
import { docsUrlFor } from '../../shared/docs-url.js';
import { reportProblems } from '../../shared/report-problems.js';
import { tagNodeTypes } from '../../shared/tag-node.js';
import { findInterpolatedAttributeProblems, findInterpolatedStringProblems, findOmittedAttributeProblems } from './find-twig-interpolation-problems.js';
import { messages } from './messages.js';
import { optionsSchema, resolveOptions } from './options.js';
import type { TagWithAttributes } from './types.js';

export const noTwigInterpolation: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow Twig interpolation in attributes and strings',
      url: docsUrlFor('no-twig-interpolation'),
    },
    schema: [optionsSchema],
    messages,
  },

  create(context) {
    const options = resolveOptions(context.options[0]);
    const { omittedAttributes, strings } = readTwigServices(context.sourceCode, context.id);

    const checkTag = (tag: TagWithAttributes) => reportProblems(context, findInterpolatedAttributeProblems(tag, options));
    const checkTagByNodeType = Object.fromEntries(tagNodeTypes.map((nodeType) => [nodeType, checkTag]));

    return {
      Program: () => reportProblems(context, [...findOmittedAttributeProblems(omittedAttributes, options), ...findInterpolatedStringProblems(strings)]),
      ...checkTagByNodeType,
    } as Rule.RuleListener;
  },
};
