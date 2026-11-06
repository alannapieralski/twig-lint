# twig-lexer (vendored fork)

```
Name:              twig-lexer
URL:               https://gitlab.com/nightlycommit/twig-lexer
Version:           1.0.0 (npm), identical source to tag 0.9.2
Revision:          dda1882119651768418e8e8749b3383469f5e4e8
License:           Apache-2.0
License File:      LICENSE
Copyright:         Eric MORAND
Update Mechanism:  Manual (upstream dormant since April 2024)
```

## Description

twig-lexer is a TypeScript port of Twig's PHP lexer (Twig 2.x era). It is
lossless: every character of a template ends up in exactly one token, which is
what lets this package map tokens back to exact source ranges.

It is forked rather than depended on because upstream has not been released
since April 2024 and lags behind Twig 3.x syntax that Drupal 10/11 templates
can use. Every difference from upstream is a patch file in this directory.

## Layout

| Path | What it is |
|---|---|
| `pristine/` | Upstream files, byte for byte, from the revision above. Never edited. |
| `patches/series` | The order in which patches are applied. |
| `patches/TL-NN-*.patch` | One patch per concern, each with a [DEP-3](https://dep-team.pages.debian.net/deps/dep3/) header. |
| `LICENSE` | Upstream's licence, unchanged. |
| `../../src/lexer/` | The shipped lexer: `pristine/src/main/lib/{Lexer,SyntaxError,Token,TokenType}.ts` with every patch applied. Generated, committed, and checked by `npm run vendor:check`. |

Patch headers use the DEP-3 fields `Description`, `Author`, `Origin`,
`Forwarded` and `Last-Update`, plus two project fields: `Twig-Reference`
(the Twig release or commit whose behaviour the patch reproduces) and `Test`
(what proves it).

## Files not shipped

- `TokenStream.ts`: a token stream and AST visitor this package does not use.
  It builds functions with `new Function`, which is unwanted in an ESLint
  parser. It stays in `pristine/` because upstream's `index.ts` and tests
  import it.
- `index.ts`: upstream's barrel file. This package imports the lexer files
  directly.
- Upstream tests (`pristine/src/test`): not shipped, but run against the
  patched sources by `npm run test:upstream` to prove patches do not break
  upstream behaviour. The TokenStream tests are not vendored.

## Build settings

`src/lexer` is compiled as its own TypeScript project (`tsconfig.lexer.json`)
with upstream's own strictness (`noImplicitAny` only). Compiling it under this
package's `strict` settings reports 66 findings (possibly-null regex matches,
uninitialised fields) that are not bugs; fixing them would add cosmetic
patches that hide the meaningful ones. The rest of the package is compiled
with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

## Local modifications

Upstream is a port of Twig's 2.x-era lexer and has not been released since April 2024. The kinds
below say why each change exists: **Port bug** where the JavaScript port behaves differently from
Twig's PHP on the same text, **Newer Twig** where Twig 3 added syntax after the port, **Port fix** and
**Licence** for module format and notices. No maintained JavaScript Twig lexer exists
to replace it: twing depends on this one, twig.js matches regular expressions inside its expression
compiler, and ludtwig (Rust) and tree-sitter-twig (C) have their own.

| ID | Kind | Change | Why | Twig reference | Test |
|---|---|---|---|---|---|
| TL-01 | Port fix | Add `.js` extensions to relative imports | Shipped as native ES modules, where Node requires full specifiers | None (port fix) | `npm run typecheck`, `npm run test:upstream` |
| TL-02 | Port bug | Whitespace in the comment, verbatim, line and interpolation patterns is PCRE's ASCII `\s` | JavaScript's `\s` also matches NBSP, BOM and U+2028, so `{# a<NBSP>#}` ended the comment at the NBSP | None (port fix) | `whitespace-edges.twig` parity |
| TL-03 | Port bug | Names may contain any character from U+007F upwards | PHP matches `\x7f-\xff` per byte, so any UTF-8 name is valid; upstream threw on `名前` | None (port fix) | `names.twig` parity |
| TL-04 | Port bug | A backslash-escaped line break is allowed inside strings | PHP's `/s` flag lets `\\.` match a newline; JavaScript's `.` does not, so upstream threw | None (port fix) | `strings.twig` parity |
| TL-05 | Newer Twig | Operators are matched at the cursor with Twig's lookahead `(?=[\s()\[{])` and lookbehind `(?<![.\|]\s\|.[.\|])` | Upstream only had the lookahead with `(`, and matched on the text after the cursor, where a lookbehind sees nothing | Twig 3.1.0, 3.24.0 | `operators.twig`, `operator-edges.twig` parity |
| TL-06 | Newer Twig | Numbers with `_` separators and optionally signed exponents | Upstream split `1_000` and `1e3` into a number and a name | Twig 3.17.0 | `numbers.twig` parity |
| TL-07 | Newer Twig | Lex `# comment` inside expressions as `INLINE_COMMENT` | Upstream throws "Unexpected character #" | Twig 3.15.0 | `comments.twig` parity |
| TL-08 | Licence | Add a derived-and-modified notice to `Lexer.ts`, `Token.ts` and `TokenType.ts` | Apache-2.0 §4(b); applied last so it never shifts other patches | None (licence compliance) | `npm run vendor:check` |

Patches apply at every level; this package uses level 3 only. The operator
list is not patched: `TwigLexer` in `src/twig/tokens.ts` sets the protected
`operators` field to Twig's list in `src/twig/operators.ts`, which
`test/syntax-coverage.test.ts` checks against Twig's own inventory.

Every shipped file except `SyntaxError.ts` is modified; `SyntaxError.ts` is
byte-identical to upstream and carries no notice.

## Commands

| Command | What it does |
|---|---|
| `npm run vendor:check` | Fails if `src/lexer` differs from pristine plus patches. |
| `npm run vendor:write` | Regenerates `src/lexer` from pristine plus patches. |
| `npm run test:upstream` | Runs upstream's tape tests against the patched sources. |
| `node scripts/vendor.ts --workspace twig-lexer <dir>` | Creates a git workspace of pristine plus current patches for writing a new patch. |

## Adding or changing a patch

1. `node scripts/vendor.ts --workspace twig-lexer /tmp/twig-lexer-ws`
2. Edit the files in the workspace.
3. Save `git -C /tmp/twig-lexer-ws diff` as `patches/TL-NN-short-name.patch`,
   prefixed with a DEP-3 header (copy one from an existing patch).
4. Add the file name to `patches/series` and a row to the table above.
5. `npm run vendor:write && npm run vendor:check && npm run test:upstream && npm test`

Never edit `src/lexer` directly: `npm run vendor:check` fails when it drifts
from pristine plus patches, so run it in CI.

## Re-syncing

- **A new twig-lexer release:** replace `pristine/` with the new revision,
  update the header above, then re-run the steps above. Drop patches that
  upstream now covers and refresh any that no longer apply.
- **A new Twig release:** compare Twig's lexer and operator list between the
  supported version and the new one, for example
  `git diff v3.29.0 v3.30.0 -- src/Lexer.php src/Extension/CoreExtension.php`
  in a Twig checkout, then add one patch per new behaviour.
