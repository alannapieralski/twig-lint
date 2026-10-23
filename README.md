# Twig Lint

ESLint for Twig templates, with Tailwind CSS and HTML linting for Drupal themes.

| Package | What it is |
|---|---|
| [`twig-eslint-parser`](packages/twig-eslint-parser) | The parser: HTML markup plus Twig expressions as one ESLint AST with exact source ranges. No rules. |
| [`eslint-plugin-twig-tailwind`](packages/eslint-plugin-twig-tailwind) | Needs [`eslint-plugin-better-tailwindcss`](https://github.com/schoero/eslint-plugin-better-tailwindcss) as a peer dependency. Teaches it where classes live in Twig, with a Drupal opt-in and room for your own selectors, and adds a processor for interpolated strings and the `no-twig-interpolation` and `no-unparsed-twig` rules. |
| [`eslint-plugin-twig-html`](packages/eslint-plugin-twig-html) | Rules for the HTML layout and quoting in Twig templates that understand Twig blocks: `attrs-newline`, `indent`, `multiline-html-element-content-newline` and `quotes`. |

All packages share one version and are released together.

## Development

Needs Node.js 24.15 or later (`.nvmrc` pins the version used here) and npm 11.10 or later.

```sh
nvm use
npm install
```

| Command | What it does |
|---|---|
| `npm test` | Builds the parser, then runs every package's tests and the corpus tool's unit tests. |
| `npm run typecheck` | Builds the parser, then type-checks every package and the corpus tool. |
| `npm run build` | Compiles every package to its `dist`. |

Package-specific commands, such as the twig-lexer fork checks, are listed in each package's README
and run with `-w <package>`.

## Testing on real templates

Fixtures prove the cases someone thought of. The corpus run proves the parser and every rule on
the templates you actually have: Drupal core, contributed modules and your themes.

1. Copy `corpus.config.example.json` to `corpus.config.json` and list the project folders to
   check. Every `*.twig` file under a root is used, except in `node_modules`, `vendor` and `.git`.
   Mark a few roots `"quick": true` for fast runs. The file is git-ignored.
2. For a Tailwind project, tell the whole-config checks where its Tailwind lives, with paths
   relative to the root:
   `"tailwind": { "cwd": "themes/custom/x", "entryPoint": "themes/custom/x/src/style.css", "tsconfig": "themes/custom/x/tsconfig.json" }`.
   A Tailwind 4 project without an `entryPoint` is reported as not configured.
3. Run it:

| Command | What it runs |
|---|---|
| `npm run corpus` | Every check of every package, on every root, except the slow ones. |
| `npm run corpus -- --slow` | The same, plus the slow whole-config checks. Run this before a release. |
| `npm run corpus -w eslint-plugin-twig-html` | Only that package's checks, slow ones included. Works for each package. |
| `npm run corpus -- --rule twig-html/attrs-newline` | One rule on every root. Use it after adding or changing a rule. |
| `npm run corpus -- --rule attrs-newline --sample 20` | The same, and write 20 before/after diffs of the fix, and sampled reports with their source lines, to `corpus-report/samples`. |
| `npm run corpus -- --strict` | Fail when a check's reports or fixes swing against the last run, a check is skipped, or more templates are skipped. |
| `npm run corpus -- --quick` | Only the roots marked `quick`. |
| `npm run corpus -- --roots drupal,theme` | Only roots whose path contains one of these strings. |
| `npm run corpus -- --list` | Which checks match the filters, without running them. |
| `TWIG_CORPUS=dir:dir npm run corpus` | Use these folders instead of the config file. |

### The checks

- **Parser** (`packages/twig-eslint-parser/test/corpus.ts`), each independent of the others:
  - `lexer-parity`: our lexer produces exactly the tokens real Twig does: types, values, extents,
    lines and columns (needs PHP and `composer install` in `tools/twig-oracle`).
  - `html-oracle`: the HTML tree matches what a browser's tokenizer (parse5) reads once the Twig is
    masked out, using Twig's own token positions rather than ours. It catches dropped, merged and
    misnamed attributes, dropped close tags and tags read inside raw text.
  - `output-matches-source`: every character of the template belongs to exactly one node, attribute
    text is exact, children sit inside their parents, and no close tag is lost.
  - `metamorphic`: rewrites that cannot change the meaning (spaces inside Twig delimiters, a space
    between a Twig tag and an attribute name, Windows line endings) must not change the tree.
  - `converts-every-block`: every Twig block converts to an expression tree.
  - `line-coverage`: a per-line report of which lines the parser read, and what damaged the ones it
    did not.
  - `mutation-recall`: applies small defects and harmless rewrites to a sample of templates and
    checks the parser flags the defects.
- **Rules** (`packages/*/test/corpus.ts`): every rule of a plugin gets a check automatically. It
  runs the rule alone and counts its reports. For a fixable rule it applies the fixes one pass at a
  time and fails if a fix does not resolve its own report, oscillates, or has not settled after 10
  passes. A fixable rule must say what its fix keeps: `'layout'` (only the whitespace between
  tokens changes; every attribute, text and Twig block stays byte for byte), `'class-tokens'` (class
  lists are reordered or rewrapped, never lose or duplicate a class or move a `[ ]` or `|` group delimiter) or
  `'code'` (it must still parse with the same Twig blocks). Every fix must also keep the template's
  line endings: it may not add a kind of line break (`\n`, `\r\n` or `\r`) the template does not
  already use, and may not leave more lines of an opening tag (attribute lines and a `>` on its own
  line) less indented than the tag's own line. A rule that throws is a failure.
- **Whole configs** (slow): the tailwind plugin's `recommended` and `recommended + drupal` configs
  run as a user gets them, `better-tailwindcss` autofixes included, under the `'class-tokens'` rule.
  Tailwind is found per root; a root without one falls back to the plugin's own Tailwind 4, and a
  Tailwind older than 3.3 is skipped with the reason.
- **Canaries** (`tools/corpus/canaries`): synthetic templates that every run includes. Each lists
  what each check must find, so a rule that stops reporting fails the run even when the real
  templates have nothing for it. See the folder's README.

### Progress

The run prints what it is doing to the terminal as it goes: the roots found and how many
templates each holds, then for each check a `starting` line, a progress line, and a `done` line with
its reports and failures. On a terminal the progress line rewrites in place a few times a second;
piped or in a log it prints a line every 10% (or every 5 seconds).

### The report

Everything is written to `corpus-report/` (git-ignored, because it holds local paths):

- `summary.md`: one row per check, the first new failures of each, stale baseline entries, the
  canaries still pending, and what changed since the last run.
- `findings.ndjson`: one JSON object per finding: check, status (`report`, `new`, `known`,
  `expected` or `skipped`), root, file, line, column, message, the source line, and whether the template is in a
  `core`, `contrib` or `dist` folder.
- `coverage.ndjson`: with `line-coverage`, the per-line coverage of each template.
- `failures/<check>/`: the before and after of a failed fix, as a diff.
- `samples/<check>/`: with `--sample`, fix diffs and `reports.md`, reports in context grouped by
  message.

Each run is compared with the previous one, kept in `corpus.previous-run.json` (git-ignored), but
only on templates whose content has not changed, so a run on a few roots compares fairly. A
`--strict` run that fails does not replace the previous run, so the change stays visible until a run
without `--strict` records it. A check that is skipped, such as `lexer-parity` without PHP, keeps its
previous results, and its canaries are not judged.

The run fails for failures that are new and for canaries that miss. Failures you accept, such as a
template that is not valid HTML, are recorded with `npm run corpus -- --update-baseline` in
`corpus.baseline.json` (git-ignored). Entries are keyed by a hash of the template's content and the
message without its numbers, so they survive a template moving. The summary lists the entries that
no longer happen, and `--update-baseline` drops exactly those. A run with `--quick`, `--roots` or
`TWIG_CORPUS` is partial: it only judges the templates it covered. A full run also drops the entries of
templates that were edited or deleted. Entries of a skipped check, or of a template a check skipped,
are always kept.

### Adding a rule

Export it from the plugin and say what its fix keeps in the package's `test/corpus.ts` if it is
fixable. Add a canary with a template it must report. Then run
`npm run corpus -- --rule <name> --sample 20`, read the diffs and the sampled reports, and fix or
baseline what it finds. To add a different kind of check, add a `Check` to that file's `checks`
array. The runner and the config live in `tools/corpus`, which is not published, and `npm test` runs
its own unit tests.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org), scoped to the
package they change (`fix(parser): ...`, `feat(twig-html): ...`). The release changelog is built from
them.

### Dependency policy

Installs only accept package versions published at least 7 days ago (`min-release-age=7` in
`.npmrc`). That setting needs npm 11.10 or later, so `devEngines` makes older npm versions fail
instead of silently ignoring it. Every dependency is pinned to an exact version and upgraded by
hand.

## Releasing

Releases use [release-it](https://github.com/release-it/release-it) from the repository root. One
run releases every package at the same version.

Before the first release:

1. Log in to npm with the account that will own the packages: `npm login`.
2. Create a GitHub token that can create releases on this repository and export it as
   `GITHUB_TOKEN`.

Then, on an up-to-date `main` with a clean working tree:

```sh
npm run release
```

release-it will:

1. Check the npm login, then run the lexer drift check, typechecks and all tests.
2. Work out the next version from the commits since the last `v*` tag (`fix` is a patch, `feat` a
   minor, a breaking change a major) and ask you to confirm it.
3. Write `CHANGELOG.md`, bump the root and every package to that version, point both plugins at
   the same parser version and update the lockfile.
4. Publish `twig-eslint-parser`, then `eslint-plugin-twig-tailwind` and `eslint-plugin-twig-html`,
   to npm, asking for a one-time password if the account needs one.
5. Commit `chore(release): x.y.z`, tag `vx.y.z`, push, and create the GitHub Release with the
   changelog as its notes.

The first release proposes 0.1.0, with every commit so far in its changelog. Until 1.0.0, a
breaking change would propose 1.0.0; pick a different increment at the prompt if that is not
wanted yet, or pass the version explicitly (`npm run release -- 0.3.0`).

Use `npm run release -- --dry-run` to see every step without changing anything.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).
