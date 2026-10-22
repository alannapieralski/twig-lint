# es-html-parser (vendored fork)

```
Name:              es-html-parser
URL:               https://github.com/yeonjuan/es-html-parser
Version:           0.3.2
Revision:          0dd4a9c3aee1674111c9fcc10be76acf4a37163d
License:           MIT
License File:      LICENSE.md
Copyright:         YeonJuan
Update Mechanism:  Manual
```

## Description

es-html-parser is the HTML parser behind html-eslint. It accepts template ranges and keeps each one
as a single opaque character, which works for templates inside text and attribute values but not
for a template that is part of the markup's structure: one inside a tag name, between attributes,
or glued to an attribute name. It also drops a close tag that does not match the current element
instead of closing back to it as browsers do.

It is forked so the Twig blocks this package's lexer finds can be handed over with their kind, and
the tokenizer can treat each block according to its kind and position. The tree keeps the shape
html-eslint rules and better-tailwindcss read. Every difference from upstream is a patch in this
directory.

## Layout

| Path | What it is |
|---|---|
| `pristine/` | Upstream's `src/` (with its tests, fixtures and snapshots), `package.json`, `tsconfig.json`, `jest.config.js` and `LICENSE.md` from the revision above. Never edited. |
| `patches/series` | The order in which patches are applied. |
| `patches/EHP-NN-*.patch` | One patch per concern, each with a [DEP-3](https://dep-team.pages.debian.net/deps/dep3/) header. |
| `test-support/jest-file-snapshot.ts` | A read-only stand-in for `jest-file-snapshot`, so upstream's tests run under vitest. |
| `LICENSE.md` | Upstream's licence, unchanged. |
| `../../src/es-html-parser/` | The shipped parser: every `.ts` file under `pristine/src` except tests, with every patch applied. Generated, committed, and checked by `npm run vendor:check`. |

Patch headers use the DEP-3 fields `Description`, `Author`, `Origin`, `Forwarded`, `Test` and
`Last-Update`. `Forwarded: no` marks a change that would help other template languages too and is
worth offering upstream.

## Build settings

`src/es-html-parser` is compiled as its own TypeScript project (`tsconfig.es-html-parser.json`)
with upstream's own strictness (`strict`), not this package's extra checks
(`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).

## Local modifications

| ID | Change | Why | Test |
|---|---|---|---|
| EHP-00 | Expect vitest's format for an inline error snapshot | Upstream runs its tests with jest; test-only | `npm run test:upstream` |
| EHP-01 | Full `.js` specifiers in relative imports, `export type` for type re-exports | Shipped as native ES modules under `isolatedModules` | `npm run typecheck`, `npm run test:upstream` |
| EHP-02 | Template ranges may carry a kind (`print`, `tag`, `comment`) | The handlers need to know what each template is | Used by EHP-04 and EHP-05 |
| EHP-03 | Templates stay opaque inside `script`, `style` and raw text; raw tag names are escaped and case-insensitive | A Twig string holding `</script>` ended the script early | `test/parser/parse-for-eslint.test.ts` |
| EHP-04 | `<` followed by a print opens a tag; a template glued to the name stays in the open tag start, and the name ends where it starts | `<div{{ attributes }}>` had the name `div{{`, and `<{{ tag }}>` was text | `test/parser/parse-for-eslint.test.ts` |
| EHP-05 | A Twig tag among attributes is an attribute of its own and ends any name it follows; comments are skipped | `{% if x %}class` and `{{ a }}{% if b %}` were read as single attribute names | `test/parser/parse-for-eslint.test.ts` |
| EHP-06 | Close tag names end where a template starts, as open tag names do; close tags pair with open tags by a name key without whitespace or a trailing `/`; only a `Tag` can be closed, so `</>` never matches the Document | `</{{element}}>` did not close `<{{ element }}>`, and `</div/>` did not close `<div>` as it does in a browser | `test/parser/parse-for-eslint.test.ts` |
| EHP-07 | A close tag that matches an open ancestor closes back to it (HTML's "any other end tag" step), in one walk up the open elements. An element that is never closed (closed back by an ancestor, or open at the end of the input) ends where its last child ends | One never-closed element swallowed every later close tag. An unclosed element's range stopped at its open tag while its children ran past it, so ESLint's `getNodeByRangeIndex` skipped them and `getText` returned only the open tag | `test/parser/parse-for-eslint.test.ts`, the "child inside parent" output check, upstream snapshot "Custom tag raw content" |
| EHP-08 | `/` inside an unquoted attribute value is part of the value; only whitespace and `>` end it (HTML's "attribute value (unquoted)" state, as in htmlparser2). An unquoted value that runs to the end of the input is kept | `href=/home` lost its value and `href=a/b` was read as `href=a`. `<a href=/>` now has the value `/`, and `<div class=a/>` has the value `a/` and stays open, as in a browser | `test/parser/parse-for-eslint.test.ts` |
| EHP-09 | A `voidElements` option names extra elements that never have content or a close tag, like `<br>` | Drupal's `<head-placeholder token="...">` was never closed and swallowed the markup after it | `test/parser/parse-for-eslint.test.ts` |

## Commands

| Command | What it does |
|---|---|
| `npm run vendor:check` | Fails if `src/lexer` or `src/es-html-parser` differs from pristine plus patches. |
| `npm run vendor:write` | Regenerates both from pristine plus patches. |
| `npm run test:upstream` | Runs both upstream test suites against the patched sources. |
| `node scripts/vendor.ts --workspace es-html-parser <dir>` | Creates a git workspace of pristine plus current patches for writing a new patch. |

## Adding or changing a patch

1. `node scripts/vendor.ts --workspace es-html-parser /tmp/ehp-ws`
2. Edit the files in the workspace.
3. Save `git -C /tmp/ehp-ws diff` (after `git -C /tmp/ehp-ws add -A -N` for new files) as
   `patches/EHP-NN-short-name.patch`, prefixed with a DEP-3 header.
4. Add the file name to `patches/series` and a row to the table above.
5. `npm run vendor:write && npm run vendor:check && npm run test:upstream && npm test`

Never edit `src/es-html-parser` directly.

## Re-syncing

Replace `pristine/` with the new revision, update the header above, then re-run the steps above.
Drop patches that upstream now covers and refresh any that no longer apply. html-eslint's own
parser wrapper is not vendored: `src/html/` rebuilds the parts this package needs (the Program,
tokens, comments, style sheets and visitor keys), so check html-eslint's release notes for changes
to the tree it hands its rules.
