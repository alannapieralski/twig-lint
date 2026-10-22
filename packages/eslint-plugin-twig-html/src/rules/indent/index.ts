import type { Rule } from 'eslint';
import { readTwigServices } from 'twig-eslint-parser';
import { docsUrlFor } from '../../shared/docs-url.js';
import { reportProblems } from '../../shared/report-problems.js';
import { createAttributesOf } from '../../shared/tag-attributes.js';
import { findIndentProblems, type MarkupProgram } from './find-indent-problems.js';
import { messages } from './messages.js';
import { indentSizeSchema, optionsSchema, resolveOptions } from './options.js';
import { readRawContentTags } from './html/raw-content-tags.js';

export const indent: Rule.RuleModule = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Indent HTML and Twig blocks one step per level of nesting',
      url: docsUrlFor('indent'),
    },
    fixable: 'whitespace',
    schema: [indentSizeSchema, optionsSchema],
    messages,
  },

  create(context) {
    const options = resolveOptions(context.options[0], context.options[1]);
    const { text } = context.sourceCode;
    const { blocks, omittedAttributes, strings } = readTwigServices(context.sourceCode, context.id);
    const attributesOf = createAttributesOf(omittedAttributes);
    const rawContentTags = readRawContentTags(context.languageOptions.parserOptions);

    const checkProgram = (program: unknown) => reportProblems(context, findIndentProblems(program as MarkupProgram, { text, blocks, attributesOf, rawContentTags, strings }, options));

    return { Program: checkProgram };
  },
};
