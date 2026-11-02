# Readable logic

Review speed is the goal. Code here is longer than it could be so it reads in one pass.

## Naming

- Functions are verb phrases that say what they return or decide.
  - `is…`, `has…`, `can…`: return a boolean (`isTwigBalancedWithin`).
  - `find…`: return the things that match, possibly none (`findAttributeGroups`).
  - `describe…`: return a plain description of something (`describeGapsBetween`).
  - `build…`, `count…`, `read…`: do what they say.
- Names stay short enough to read as a name, not a phrase. If a name needs more than about three
  words, the function is doing too much, or the module, parameter types or return type should carry
  part of the meaning.
- Variables are nouns, booleans start with `is`, `has` or `should`. No `data`, `item`, `tmp`,
  `res`, single letters or abbreviations. A loop counter is `index`, not `i`.
- Regular expressions are named constants that say what they match
  (`leadingHtmlWhitespace`), never written inline in a condition.
- A magic string or number becomes a named constant.

## Structure

- Guard clauses first. Handle the empty, absent and unsupported cases at the top and return.
- One level of abstraction per function. The top function reads as a list of steps, each a call
  to a named function. The detail is one level down.
- Name intermediate values instead of nesting expressions. Prefer
  `const isFixable = allGapsAreWhitespace && !isOpenTagUnreadable(tag, text);` on its own
  line to the same condition inside a spread.
- No nested ternaries, no chained `&&` and `||` that mix meanings, no comma operators, no loops
  whose header does the work.
- Prefer returning new values over mutating arguments or outer variables. Local accumulation inside
  a small function is fine.
- Types name the shapes that move between functions (`AttributeSeparator`, `ContentEdge`, `Problem`).
- A function that does not fit on one screen is split. A file that needs "and" to describe it is
  split (see `shared-code.md`).

## Spacing

- A blank line between steps of a function, and between a block of declarations and what uses them.
- One statement per line. Break long argument lists one per line.
- Order a file top to bottom: imports, types, constants, then helper functions, with the exported
  function last. A helper sits above the function that calls it.

## Comments

No comments by default. Simplify and rename until the code explains itself. A comment is fine
where the logic is truly complex and cannot be made simpler: say why, in as few lines as possible.

## Before and after

A nested ternary picking a message:

```ts
const messageId = !firstWrong.isClosing ? 'attributeLine' : options.closeStyle === 'newline' ? 'closeOnOwnLine' : 'closeAfterLastAttribute';
```

```ts
function messageIdForSeparator(separator: AttributeSeparator, closeStyle: CloseStyle): MessageId {
  if (!separator.isClosing) {
    return 'attributeLine';
  }
  return closeStyle === 'newline' ? 'closeOnOwnLine' : 'closeAfterLastAttribute';
}
```

A loop whose header does the work:

```ts
for (let index = firstBlockIndexFrom(range[0], blocks), block = blocks[index]; block && block.range[1] <= range[1]; block = blocks[++index]) depth += block.depthChange;
```

```ts
function findBlocksWithin(range: Range, blocks: readonly TwigBlockSummary[]): TwigBlockSummary[] {
  const firstIndex = firstBlockIndexFrom(range[0], blocks);
  const blocksFromStart = blocks.slice(firstIndex);
  return blocksFromStart.filter((block) => block.range[1] <= range[1]);
}

function depthChangeWithin(range: Range, blocks: readonly TwigBlockSummary[]): number {
  return findBlocksWithin(range, blocks).reduce((depth, block) => depth + block.depthChange, 0);
}
```

A `create` doing the work itself:

```ts
create(context) {
  const locOf = (range) => ({ start: sourceCode.getLocFromIndex(range[0]), end: sourceCode.getLocFromIndex(range[1]) });
  const checkAttribute = (attribute, isInReadableTag) => {
    const { value, startWrapper, endWrapper } = attribute;
    if (startWrapper && endWrapper) return checkWrappedAttribute(attribute, startWrapper, endWrapper);
    if (startWrapper || endWrapper || !value) return;
    checkUnquotedAttribute(attribute, value);
  };
  const checkTag = (node) => {
    for (const attribute of node.attributes) checkAttribute(attribute, !isOpenTagUnreadable(node, text));
  };
  return { Tag: checkTag, ScriptTag: checkTag, StyleTag: checkTag };
}
```

```ts
create(context) {
  const options = resolveOptions(context.options[0]);
  const services = readTwigServices(context.sourceCode, context.id);

  const checkTag = (tag: TagNode) => reportProblems(context, findQuoteProblems(tag, services, options));

  return balancedTagListeners(checkTag, ['Tag'], services.blocks);
}
```
