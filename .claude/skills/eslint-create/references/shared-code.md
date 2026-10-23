# Shared code

## Search first

Before adding a function, type or constant, look for it in this order and use what exists:

1. The rule's own folder.
2. The plugin's `src/shared/`.
3. The parser's public API: `packages/twig-eslint-parser/src/index.ts` (for example
   `readTwigServices`, `containsTwig`, `isAttributeNode`).
4. The other plugin's `src/shared/`.

Useful searches:

```sh
grep -rn "function <name>\|const <name>\b\|type <Name>\b" packages/*/src
grep -rn "getLocFromIndex" packages/eslint-plugin-*/src
```

A second declaration of the same type or function, even with a slightly different shape, is a
duplicate. Fix it by moving the first one to where both can import it.

## Where a helper lives

| Used by | Lives in |
|---|---|
| One rule | that rule's folder |
| Two or more rules in one plugin | `src/shared/<concept>.ts` in that plugin |
| Both plugins, and it is about Twig or the parser's tree | exported from `twig-eslint-parser` (`src/index.ts`), and documented in the parser README |
| Both plugins, and it is not about Twig | no home yet: stop and ask the user before creating one (a private workspace package is the likely answer) |
| Corpus tooling | `tools/corpus` |

Move code on its second use, in the same change that adds the second use. Do not copy it first.

A helper that only one rule uses but is clearly nameable (`isOpenTagSwallowingMarkup`) is allowed
to start in that rule's folder. Anything that reads Twig structure, HTML whitespace or ESLint
reporting is shared from the start, because the next rule will want it.

## Naming and size

- A file is named for its concept in kebab-case: `indentation.ts`, `html-whitespace.ts`,
  `twig-blocks.ts`, `tag-listeners.ts`, `problem.ts`, `report-problems.ts`.
- Never `utils`, `helpers`, `common`, `misc`, `lib`, `index` as a grab bag, or a name made of the
  first rule that used it.
- A file has one concept. If its description needs "and" (indentation and options and listeners),
  split it. If a file's exports are unrelated to each other, split it.
- A folder under `shared/` is allowed when a concept has several files (`shared/tag/`), and then it
  may have an `index.ts` that re-exports them. Otherwise import files directly.
- Lists of names (HTML elements, tag types) are constants in a file named for what they list
  (`html-elements.ts`), exported as `readonly` arrays or sets, and written once.

## Things that must exist once per plugin

These are not about Twig, so strictly they belong in code both plugins import, and that home is
undecided (see the ladder). Until the user decides, each plugin may hold one copy of each item
below, kept identical, and nothing else may be copied between plugins. Ask the user before adding
an item to this list.

- The `Range` type (`readonly [number, number]`) and the other small types that cross files.
- The tag node types a rule listens to (`Tag`, `ScriptTag`, `StyleTag`).
- The function that builds an ESLint location from a range.
- The `Problem` type and `reportProblems`.
- The docs URL builder for a rule id.
- The option schema pieces shared by several rules.

If a plugin lacks one of these and a rule needs it, add it to `shared/` as part of the change.
Never declare it again inside the rule.

## Splitting a file that has grown

When a shared file mixes concepts, split it by concept, move each piece to a file named for it, and
update every import in one change. Keep the exported names unless they are misleading. Run
`npm run typecheck` and `npm test` before and after to show behaviour did not change.
