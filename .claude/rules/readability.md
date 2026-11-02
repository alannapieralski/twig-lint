---
paths:
  - "packages/*/src/**"
  - "tools/**"
---

# Readability

`common-mistakes.md` covers duplication, naming and imports. This file
covers how code reads. Before finishing, read each exported function top to bottom. If you have to
open a helper to understand a line, fix the line or the helper's name.

## Exported functions read as steps

- **An exported function is a short list of named steps.** Each intermediate result is a named
  constant, so every line says what it holds. The helpers it calls are named for what they return,
  not for how they work.
- **A helper that returns an offset says which one**: `findOpenerEnd`, `findLastCodeOffsetBefore`.
  A parameter says what position it is: `lineStart`, not `offset`.
- **Parameters keep one order across sibling helpers**: `text` first, then `block`, then the rest.

| Bad | Better |
|---|---|
| `return lastVisibleOffset >= openingEndOf(block, text) && !ELEMENT_SEPARATORS.has(text[lastVisibleOffset] ?? '');` | `const isFirstLineAfterOpener = ...;`<br>`const isAfterElementSeparator = ...;`<br>`return !isFirstLineAfterOpener && !isAfterElementSeparator;` |

## One idea per line

- **Split a line that holds more than one decision**: a `filter` with a compound condition, a chain
  of `filter`, `some` and `includes`, or a condition joined by more than two `&&` or `||`. Name each
  part as a predicate (`isOpenedOnSameLine`) or a collection (`outerPairsOpenedOnTheSameLine`).
- **Leave simple lines alone.** `items.map((item) => item.name)` and an early return guarded by `!close`
  are already clear. So is a short chain of `&&` or `||` over named checks, such as
  `!isContinuation && !isChainLine(text, contentStart) && !findClosedPair(line)`. Do not name a value
  used once that says nothing more than the expression does.

## Returns

- **Return a named variable when the expression is composed**: more than one operation, such as a
  spread of a `filter`, a `map` over a `filter`, or a ternary of calls. The name says what is returned.
- **Exceptions:**
  - A returned object literal whose members are each named and short stays as written. The member
    names already say what each one is, and pulling them out above the `return` adds nothing.
  - A return of one operation (`return names.filter(isUsed);`) needs no variable.

```ts
return {
  addTag: (tag) => tagProblems.push(...findInterpolatedAttributeProblems(tag, options)),
  findProblems: () => {
    const attributeProblems = [...tagProblems, ...findOmittedAttributeProblems(source.omittedAttributes, options)];
    const isInReportedAttribute = (problem: Problem) => attributeProblems.some((attributeProblem) => isInside(problem, attributeProblem));
    const stringProblems = findInterpolatedStringProblems(source.strings).filter((problem) => !isInReportedAttribute(problem));

    return [...attributeProblems, ...stringProblems];
  },
};
```

## Functions inside functions

- **Do not declare a function inside another function** to hold logic. Give it a name at module level
  with its inputs as parameters, or name it as a `const` above its use when it needs the surrounding
  values.
- **These are fine:** an arrow passed straight to an array method, and the members of a returned
  object literal (see Returns).

## Comments

- **Most code has no comment.** The names say what it is and does.
- **A function a reader cannot follow from its name and signature gets a TSDoc block**, such as a
  binary search or a lookup built once and queried many times. Up to three lines say what it does,
  then one line for each `@param` and one for `@returns`.
- **No comment says why a change was made** or walks through the code line by line.

```ts
/**
 * Builds a lookup that finds the item with the latest start at or before an offset.
 *
 * @param items - The items to search, in any order.
 * @param startOf - Reads the offset an item starts at.
 * @returns A function from an offset to the last item started at or before it, or `undefined` when none has.
 */
```

## Constants and repeats

- **A value, regular expression or helper that is defined in more than two places is extracted** to
  one home, found with the placement ladder in `.claude/skills/eslint-create/references/shared-code.md`.
  Search for it with `git grep` before declaring it.
- **Export a constant only if another file imports it.** For every `SCREAMING_SNAKE_CASE` constant,
  ask whether another file needs it. If not, leave it unexported.
- **A message string used once is written inline** where it is used, not put in a constant. This is
  the exception to "a module-level constant is `SCREAMING_SNAKE_CASE`" in `common-mistakes.md`: a
  string used once in its own file and not exported is not a module-level constant.

## One word, one meaning

- **Before reusing a word as a name, a type or a message placeholder, check what it already means in
  the code.** `tag` is a `TagNode` in the code, so a message placeholder holding the tag's text is
  `writtenTag`. Two things never share a word, and one thing never has two.
