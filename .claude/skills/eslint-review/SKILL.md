---
name: eslint-review
description: This skill should be used when the user asks to "review a rule", "review this ESLint rule", "review my changes", "review this branch", "review the plugin", "audit the rules", "audit for duplicate helpers", "check this rule follows our conventions", "does this rule match the target shape", or asks for a review of anything under packages/eslint-plugin-*. It checks rules and plugins against the shape defined by the eslint-create skill and reports findings without editing.
---

# Reviewing ESLint rules and plugins

Check a rule, a plugin or a change against the shape that `eslint-create` defines. Report
findings. Do not edit unless the user asks for the fixes.

If the `code-philosophy` skill is available, load it first. The standard lives in the
`eslint-create` skill. Read its `SKILL.md` and the reference named by each check below. Never
restate the standard in a finding: name the section and say what differs.

## Procedure

1. **Scope.** Work out what is under review: a rule id, a plugin, or a diff
   (`git diff main...`). A rule means its folder, docs page, tests, corpus entry and canary. A
   plugin means every rule plus `src/index.ts`, shared code, package metadata and wiring.
2. **Touchpoints.** Check each row of `eslint-create/references/touchpoints.md` for every rule in
   scope, and search for duplicate declarations as `shared-code.md` describes. Report each missing
   touchpoint or duplicate.
3. **Read the code**: the entry file, every module it imports, the docs page, the tests. Read the
   parser README sections the rule depends on when its behaviour is in doubt.
4. **Apply the checks** below.
5. **Run what the repo runs**: the root `npm run typecheck` and `npm test` (they rebuild the
   parser first). For a new or changed rule, run the corpus through the `corpus-check` skill and
   read the samples. Say so in the report when a run was skipped.
6. **Report** in the format at the end.

## Checks

Each check is a question. The reference holds the requirement.

- **Structure** (`rule-anatomy.md`): Is the rule a folder? Does `index.ts` hold only `meta` and
  `create`, and does `create` only wire? Are options, messages and logic separate, and does logic
  return data without importing `eslint`?
- **HTML and Twig apart** (`rule-anatomy.md` "Rules with HTML and Twig"): Does a rule that handles
  both keep markup logic in `html/` and Twig logic in `twig/`? Does one list name each case it
  handles? Do `html/` and `twig/` ever import each other, or does a file mix both without saying so
  in its name?
- **Duplicates** (`shared-code.md`): For each function, type and constant the change adds, does the
  plugin, the parser's public API or the other plugin already have it, even loosely? Was a helper
  copied rather than moved on its second use?
- **File organisation** (`shared-code.md`): Is each file one concept with a concept name? Which
  files need "and" to describe them, and what should they split into?
- **Readability** (`readable-logic.md`): Do names say what is returned or decided? Any nested
  ternary, comma operator, loop doing work in its header, unnamed regular expression, magic value, overlong name or
  comment on code that could be simpler?
- **Fixes and reports** (`rule-anatomy.md`): Is a fix offered only when provably safe, with a named
  `isFixable`? Is it idempotent, minimal, line-ending safe, and skipped across Twig branches and for
  open tags that swallow markup? Do `meta.fixable` and the corpus `fixKeeps` match what it changes?
  Are reports on the smallest range with a `messageId` and complete `data`?
- **Parser assumptions** (parser README "Known limitations"): Does the rule depend on JavaScript
  semantics of Twig expressions, or on an AST shape the parser documents as not guaranteed?
- **Docs and tests** (`touchpoints.md`): Do the docs page, `meta` and tests agree? Do the tests
  cover what `rule-anatomy.md` "Tests" lists? Is there a fix-safety test and a canary for a fixable
  rule? Does any committed file hold real project names, paths or template text?
- **Plugin** (`plugin-anatomy.md`), when a plugin is in scope: Is `src/index.ts` wiring only? Do
  `package.json`, README and LICENSE match? Is the package in the root `workspaces`, the release-it
  `after:bump` command, the root README table and `test/corpus.ts`? Do peer ranges list only tested
  versions?

## Report format

Group findings by severity. One entry each.

- **Blocking**: wrong behaviour, an unsafe fix, a missing touchpoint, duplicate code, or logic in
  the entry file, in code the change adds or touches.
- **Should fix**: readability, naming, file organisation, docs or tests that disagree, in code the
  change adds or touches.
- **Consider**: smaller improvements.
- **Migration backlog**: gaps in code the change does not touch, because the repo predates the
  target shape (flat rule files, root-level shared files, logic in `create`). List them by file in
  one place. They are not defects of the change. When the user asks to audit or migrate existing
  rules, treat this group as the main result and order it by how many rules each gap affects.

Each entry gives `file:line`, the problem in one sentence, the reference section it breaks, and the
change that fixes it. Finish with what was run, what was not, and an overall verdict. If nothing is
wrong, say so and name what was checked.
