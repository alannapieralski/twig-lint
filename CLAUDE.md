# Twig Lint

ESLint parser and plugins for Twig templates. The root `README.md` describes the packages, the
commands and the corpus run.

## Docs stay in sync with the code

- Any change to a rule's behaviour, options, skipped cases or known gaps updates that rule's page
  in `packages/*/docs/rules/` in the same change. The plugin README's rules table changes only
  when a rule's one-line description does.
- Put each change under the heading it belongs to. Do not add a heading to make a change fit.
- Each fact lives in one place: the rule page. The README links to it and does not restate it.
- No changelog, upgrade notes or run statistics in any README or docs page.
- Run every example on a rule page through the rule before finishing.
- The headings of rule pages and READMEs are defined in `.claude/rules/docs.md`.

## Rule folders separate HTML from Twig

- A rule that handles both keeps its markup logic in `html/` and its Twig logic in `twig/`, and
  names each case it handles in one list. `.claude/rules/rule-folders.md` has the rules and the
  `eslint-create` skill has the layout.
