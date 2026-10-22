---
name: eslint-create
description: This skill should be used when the user asks to "create a rule", "add a rule", "change a rule", "add an option to a rule", "fix the quotes rule", "write an ESLint rule", "write the docs page for a rule", "where should this helper live", "create a plugin", "add a new ESLint plugin", or edits anything under packages/eslint-plugin-*. It defines the target shape of rules and plugins in this repo: a rule's entry file holds only the rule definition, logic lives in named modules, and shared code lives in one place.
---

# Creating and changing ESLint rules and plugins

Build and change rules and plugins to one shape, so any of them can be reviewed the same way. To
check existing work against this shape, use the `eslint-review` skill, which reads the same
references.

If the `code-philosophy` skill is available, load it before writing code. Write no comments by default: names
do the work. Add one only where the logic is truly complex and cannot be simplified.

## Terms

- **Package**: the workspace directory name, such as `eslint-plugin-twig-html`. Used with
  `npm ... -w <package>`.
- **Plugin prefix**: the short name in rule ids and docs titles, such as `twig-html`. Also the
  commit scope (`fix(twig-html): ...`). The parser's scope is `parser`.
- **Rule id**: the kebab-case name, such as `attrs-newline`.

## The shape in ten rules

1. **A rule is a folder.** `src/rules/<rule-id>/index.ts` holds `meta` and `create` and nothing
   else. Options, messages and logic sit beside it in their own files.
2. **`create` only wires.** It resolves options, reads the parser services and returns listeners
   built from imported functions. It declares no named helper functions, loops, regular
   expressions or branching. A one-line arrow that passes data between imported functions is fine.
3. **Logic returns data, the rule reports it.** Logic modules are pure functions over text, ranges
   and parser data. They return plain problem objects. One shared function turns those into
   `context.report`. Logic never imports from `eslint`.
4. **Logic specific to one rule stays in that rule's folder.** Anything that can be named as a
   concept and used by a second rule moves to a shared module on its second use. Never copy.
5. **One concept per file, named for the concept.** `indentation.ts`, `twig-blocks.ts`,
   `quote-style.ts`. Never `utils`, `helpers`, `common` or a file named after its first consumer.
6. **Code is verbose on purpose.** Clear, short names, guard clauses first, named
   intermediate values, blank lines between steps. A reviewer reads it top to bottom without
   decoding. See `references/readable-logic.md`.
7. **A fix is only offered when it is provably safe.** Reporting without fixing is a normal
   outcome. See `references/rule-anatomy.md`.
8. **Every rule has the same touchpoints**: folder, registration, docs page, README row, tests,
   corpus entry, canary. See `references/touchpoints.md`.
9. **Search before writing.** Look in the plugin's shared code, then the parser's public API
   (`packages/twig-eslint-parser/src/index.ts`), before adding a helper or type. See
   `references/shared-code.md`.
10. **HTML and Twig stay apart.** A rule that handles both keeps its markup logic in `html/` and its
    Twig logic in `twig/`, and names each case it handles in one list. Only the files where the two
    meet import from both. See `references/rule-anatomy.md`.

## Workflow for a new rule

1. Read the parser README sections "Parser services", "Markup", "Strings" and "Known
   limitations", and parse a small template to see the tree the rule will get. If the parser cannot
   see what the rule needs, stop and tell the user instead of working around it.
2. Write the tests first (`test/<rule-id>.test.ts`): cases that report, cases that stay quiet,
   cases that fix, and cases that report without fixing.
3. Create the rule folder as described in `references/rule-anatomy.md`. Write the logic as small
   named functions that return problems.
4. Place every helper using the ladder in `references/shared-code.md`. Reuse before adding.
5. Register the rule, add the docs page and README row, and add the fix-safety test, corpus entry
   and canary (`references/touchpoints.md`).
6. Run the root `npm run typecheck` and `npm test`, which rebuild the parser first. A per-package
   command uses the parser's last build and can be stale. Then run the corpus with the
   `corpus-check` skill: `npm run corpus -- --rule <rule-id> --sample 20`. Read the samples.
7. Offer a commit. Use the `conventional-commit` skill for the message format only, and do not
   let it commit without the user's go-ahead.
8. Offer a review with the `eslint-review` skill.

## Workflow for changing a rule

Follow the same steps from step 2: a failing test first, then the change, then the touchpoints that
the change affects (docs page, options table, canary, corpus). Keep the rule in the target shape.

## Workflow for a new plugin

Follow `references/plugin-anatomy.md`. A plugin's `src/index.ts` only wires: package metadata,
the rules map, configs and processors. Everything else is a named module.

## Where to read instead of restating

The repo already documents the parser, the lexer and their limits. Point to it, never copy it.

| Question | Read |
|---|---|
| What the parser produces, its options, services, markup and string handling, known limitations, Twig branches | `packages/twig-eslint-parser/README.md` |
| What can be imported from the parser | `packages/twig-eslint-parser/src/index.ts` |
| Lexer origin, Twig version, why it is forked | `packages/twig-eslint-parser/third_party/twig-lexer/UPSTREAM.md` |
| Markup reader origin and changes | `packages/twig-eslint-parser/third_party/es-html-parser/UPSTREAM.md` |
| Every Twig tag, operator and test, and how each converts | `packages/twig-eslint-parser/src/twig/syntax.ts` |
| Test templates the parser is proven on | `packages/twig-eslint-parser/test/fixtures/twig/` |
| How a finished rule documents itself | `packages/*/docs/rules/*.md` |
| Testing on real templates, canaries, adding a rule to the corpus | root `README.md` "Testing on real templates", `tools/corpus/canaries/README.md`, the `corpus-check` skill |
| Dependency and release rules | root `README.md` "Dependency policy" and "Releasing" |

The corpus is public-safe: never put real project names, paths or template content in any
committed file (see `.claude/rules/corpus.md`).

## References

- **`references/rule-anatomy.md`**: the folder, each file's job, options, messages, reporting,
  fixes, visitors and tests.
- **`references/readable-logic.md`**: naming, structure and spacing, with before and after.
- **`references/shared-code.md`**: where a helper lives, how files are named, how to avoid
  duplicates.
- **`references/plugin-anatomy.md`**: a plugin's layout, package metadata, configs, wiring into the
  monorepo.
- **`references/touchpoints.md`**: the checklist for a rule and the docs page headings.
- **`references/eslint-practice.md`**: read when a decision is not covered above. What ESLint and
  better-tailwindcss teach, with links.
