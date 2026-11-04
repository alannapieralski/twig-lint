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
| EHP-02 | Template ranges carry a kind, and each tokenizer state reads a template through one `parseTemplate` hook: a print continues what it touches, a Twig tag stands alone, a Twig comment is nothing, and inside content all three are content | Five places decided what a template meant by three techniques, and any state that string-matched its buffer could see template text, so a Twig string holding `</script>` ended a script | `test/parser/parse-for-eslint.test.ts` |
| EHP-03 | A tag name is read once, in the tag states, carried on the token as `name`, and elements pair by it; `<` opens a tag only before an ASCII letter; token types are looked up in a `Map` | `</ div>` and `</d iv>` closed a `div`, `</div class>` did not, `</{{ Tag }}>` closed `<{{ tag }}>`, `x <3` opened a tag and `<constructor>` crashed the parser | `test/parser/parse-for-eslint.test.ts`, upstream snapshots |
| EHP-04 | One raw-text handler ends script, style and raw-content elements at the appropriate end tag (`</name` and whitespace, `/` or `>`) | `"</"` in a script went into the close token, `</b ` left a textarea open, and `</script x>` did not end a script | `test/parser/parse-for-eslint.test.ts` |
| EHP-05 | `/` inside an unquoted attribute value is part of the value; only whitespace and `>` end it | `href=/home` lost its value and `href=a/b` was read as `href=a` | `test/parser/parse-for-eslint.test.ts` |
| EHP-06 | Comments end at `-->` with any extra dashes, at `--!>`, and `<!-->` and `<!--->` are empty comments | Each of these left the comment open to the end of the file | `test/parser/parse-for-eslint.test.ts` |
| EHP-07 | A `voidElements` option names extra elements that never have content or a close tag | Drupal's `<head-placeholder token="...">` was never closed and took in the markup after it | `test/parser/parse-for-eslint.test.ts` |
| EHP-08 | A close tag that matches an open ancestor closes back to it; an element that is never closed ends where its last child ends. Unlike a browser, the walk does not stop at special elements | One never-closed element took in every later close tag, and its range stopped at its open tag while its children ran past it | `test/parser/parse-for-eslint.test.ts`, the "child inside parent" output check |
| EHP-09 | At the end of the input the text, comment, raw-text, attribute name and attribute value states emit what they read | The rest of a file after an unterminated `<!--` or `<script>` was in no node | `test/parser/parse-for-eslint.test.ts`, `test/parser/diagnostics.test.ts` |

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
