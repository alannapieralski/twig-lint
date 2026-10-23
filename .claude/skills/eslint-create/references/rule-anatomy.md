# Rule anatomy

## Folder

```
packages/<plugin>/src/rules/<rule-name>/
  index.ts          meta and create only
  options.ts        Options type, defaults, schema, resolveOptions
  messages.ts       message ids and text
  <concept>.ts      logic specific to this rule, one concept per file
```

- Folder and rule id are kebab-case (`multiline-html-element-content-newline`). The exported
  constant is the camelCase form (`multilineHtmlElementContentNewline`).
- A rule with no options has no `options.ts` and uses `schema: []`.
- A type shared by two files of the rule goes in `types.ts` in the folder.
- A rule that handles both HTML and Twig, or several distinct cases, uses the layout under
  "Rules with HTML and Twig".
- Tests do not live in `src`. They sit in `<package>/test/`, and a plugin may group suites that
  lint whole configs in `test/integration/`.

## Rules with HTML and Twig

A rule that reads the markup tree and Twig separates them, so a reader sees which concern a file
belongs to, and which cases the rule handles. `indent` is the model:

```
packages/<plugin>/src/rules/indent/
  index.ts                       meta and create only
  find-indent-problems.ts        runs the cases below and concatenates their problems
  layout.ts                      the only place HTML regions and Twig regions are merged
  seams.ts                       HTML and Twig that cross (an element opened in one Twig branch)
  nesting-problems.ts            case: one step per element and Twig block
  html/                          the markup tree: elements, attributes, close tags, raw content
  twig/
    twig-frames.ts               Twig block nesting
    twig-regions.ts              what Twig contributes to the layout
    expressions/                 case: the lines inside a multi-line {{ }} or {% %}
      expression-lines.ts        walks the lines and applies the line rules in order
      bracket-rule.ts            line rule: lines inside { }, [ ] and ( )
      chain-rule.ts              line rule: .method() chains
```

- `html/` never imports from `twig/`, and `twig/` never imports from `html/`. Files that need both
  sit beside them (`layout.ts`, `seams.ts`) and say so in their name.
- Each case is one named function that returns problems. The orchestrator lists the cases in one
  place, so adding a case is adding one line and one folder.
- A case with several ways of deciding a line (brackets, chains) writes each as a small named rule
  in its own file, and one array lists them in the order they apply. A rule returns the expected
  value, or `undefined` when it does not apply.
- Types used by one side live in that side's `types.ts`. Types used by both live in the rule's
  `types.ts`.
- A rule that only touches one side, or whose HTML and Twig code is a single small file each, does
  not need the folders. Split when the rule has more than a few modules for either side.
- The rule's docs page follows the same split: its categories under "Rule details" name the HTML
  case or Twig case they describe.

## index.ts

`index.ts` imports, then exports one `Rule.RuleModule`. Names below are illustrative: search the
plugin's shared code for the real helper before inventing one.

```ts
import type { Rule } from 'eslint';
import { readTwigServices } from 'twig-eslint-parser';
import { docsUrlFor } from '../../shared/docs-url.js';
import { reportProblems } from '../../shared/report-problems.js';
import { tagListeners } from '../../shared/tag-listeners.js';
import { tagNodeTypes, type TagNode } from '../../shared/tag-node.js';
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
    const { blocks } = readTwigServices(context.sourceCode, context.id);

    const checkTag = (tag: TagNode) => {
      reportProblems(context, findAttributeProblems(tag, context.sourceCode.text, blocks, options));
    };

    return tagListeners(checkTag, tagNodeTypes, blocks);
  },
};
```

`create` is a short list of steps. The one-line `checkTag` arrow only passes data between imported
functions. If `create` grows past roughly fifteen lines, or needs a branch, a loop, a regular
expression or a named helper declared inside it, move that code into a named module.

## options.ts

```ts
export type Options = { ifAttrsMoreThan?: number; closeStyle?: 'newline' | 'sameline' };

export const defaultOptions: Required<Options> = { ifAttrsMoreThan: 1, closeStyle: 'newline' };

export const optionsSchema = {
  type: 'object',
  properties: {
    closeStyle: { enum: ['newline', 'sameline'] },
    ifAttrsMoreThan: { type: 'integer', minimum: 0 },
  },
  additionalProperties: false,
} as const;

export function resolveOptions(rawOptions: unknown): Required<Options> {
  return { ...defaultOptions, ...(rawOptions as Options | undefined) };
}
```

- Schema keys are alphabetical. `additionalProperties: false` always, so a typo fails loudly.
- Options shared by several rules (such as layout options) are defined once in `shared/`, and each
  rule's schema spreads them in.
- Merge defaults in `resolveOptions`. ESLint's `meta.defaultOptions` needs ESLint 9.15, and the
  plugins' peer range starts at 9.0, so it is not used until that range is raised.
- Read options only through `context.options`, once, in `create`.

## messages.ts

```ts
export const messages = {
  attributeLine: 'Put each attribute on its own line.',
  closeOnOwnLine: 'Put "{{close}}" on its own line.',
} as const;
```

- Report with `messageId` always, never inline `message`. Tests assert on the id.
- The text tells the author what to do, in a full sentence ending with a full stop.
- The id names the situation (`wrongHtmlQuote`, `unparsedTwig`), in camelCase.
- Data placeholders use `{{name}}`. Pass every placeholder in `data`.

## Logic modules

- Functions take plain values (text, ranges, parser data, resolved options). They never take
  `context`.
- They return data: a `Problem` per thing to report. A problem holds the range to report, the
  `messageId`, optional `data`, and optional `edits` (the replacement text for each range). The
  plugin's shared `Problem` type and `reportProblems(context, problems)` are the only code that
  touches `context.report` and `getLocFromIndex`.
- One function per step of the check, named for what it finds or decides: `findAttributeGroups`,
  `describeGapsBetween`, `isOpenTagSwallowingMarkup`.
- Anything about Twig structure that two rules need (blocks balanced within a range, a tag
  swallowing markup) is shared code. Look for it first (see `shared-code.md`).

## Fixes

- Offer a fix only when the transformation is deterministic and cannot change what the template
  renders. Compute that as a named boolean (`isFixable`) and attach the fix only when it is true.
  Report without a fix otherwise.
- Never fix across Twig branches. A range that opens a `{% if %}` without closing it, or that
  continues an `else`, is not fixable. Use the existing balance helpers.
- Never fix an open tag the parser read as swallowing the markup after it.
- One fix per report, as small as possible. Do not match the author's other style choices: ESLint
  runs the other rules afterwards, and runs up to ten passes.
- A fix must be idempotent: applying it to its own output reports nothing. The corpus fails a fix
  that oscillates or does not settle.
- Keep the file's line endings. Detect `\r\n` and reuse it.
- Set `meta.fixable` to `'whitespace'` when only whitespace changes and `'code'` otherwise. Omit
  it when the rule never fixes.
- Declare what the fix keeps in the package's `test/corpus.ts`: `'layout'` (only whitespace
  between tokens changes), `'class-tokens'` (class lists reordered or rewrapped, none lost, group
  delimiters kept) or `'code'` (still parses with the same Twig blocks).

## Reporting

- Report the smallest range that names the problem.
- Report through `reportProblems`, with `messageId`. Never hand-build `loc` in a rule.
- Set `meta.type`: `layout` for whitespace and formatting, `suggestion` for style, `problem` for
  likely mistakes. Layout and style rules are `warn` in the recommended config, problems are
  `error`.

## Visitors

- Take parser data from `readTwigServices(context.sourceCode, context.id)`, once in `create`. It
  throws a clear error when another parser parsed the file.
- Iterate service lists (`blocks`, `strings`, `omittedAttributes`, `diagnostics`) from a
  `Program` listener.
- Listen to node types for tags (`Tag`, `ScriptTag`, `StyleTag`) through the shared listener
  helper, so the list of tag types is written once.
- The JavaScript in `twigBody` only carries positions and structure. Do not write rules that
  depend on JavaScript semantics.
- Use `Node:exit` when a check needs the children first. Keep selectors narrow.

## Tests

- `test/<rule-name>.test.ts` lints real template text through the `ESLint` class with the plugin's
  recommended config and every other rule turned off, then asserts on messages and fixed output.
  Test names state the behaviour in a sentence.
- Cover: reports, stays quiet, fixes, reports without fixing (each reason the docs list), each
  option, CRLF line endings, Twig in the tag, a Twig branch crossing the tag, a template the
  parser could not read.
- A fixable rule is added to `test/fix-safety.test.ts`, which fixes every parser fixture and
  checks the output still parses and only the intended characters changed.
- Logic with its own branching gets a unit test beside the rule tests, named for the module.
