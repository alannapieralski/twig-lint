---
paths:
  - "packages/*/src/rules/**"
---

# Rule folders

- A rule that handles both HTML and Twig keeps markup logic in `html/` and Twig logic in `twig/`
  inside its folder. They never import each other. Only the files where the two meet (`layout.ts`,
  `seams.ts`, the orchestrator) import both, and their names say so.
- A rule names each case it handles (nesting, brackets, chains) as one function and lists the cases
  in one place. A case with several line rules lists them in one array, in the order they apply.
- Read `.claude/skills/eslint-create/references/rule-anatomy.md`, "Rules with HTML and Twig", for
  the layout. `src/rules/indent/` is the model.
