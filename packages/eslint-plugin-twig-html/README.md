# eslint-plugin-twig-html

ESLint rules for the HTML layout and quoting in Twig templates. The rules read the markup through
[`twig-eslint-parser`](https://github.com/alannapieralski/twig-lint/tree/main/packages/twig-eslint-parser)
and understand Twig blocks, so their fixes keep Twig nesting and Twig inside tags intact.

```twig
<button
  type="button"
  class="flex items-center"
  aria-controls="accordion-{{ id }}"
>
```

## Installation

```sh
npm install --save-dev eslint-plugin-twig-html eslint
```

Requires Node.js 20.19 or later and ESLint 8.57 or later, using flat config. The package is ESM only. `twig-eslint-parser` is
installed with it.

## Usage

```js
// eslint.config.js
import twigHtml from 'eslint-plugin-twig-html';

export default [twigHtml.configs.recommended];
```

`configs.recommended` applies to `**/*.twig` except `**/*.svg.twig`, sets `twig-eslint-parser` as the parser and turns on
`twig-html/attrs-newline`, `twig-html/indent`, `twig-html/multiline-html-element-content-newline` and `twig-html/quotes` as warnings. It works next to `eslint-plugin-twig-tailwind`'s recommended
config, which uses the same parser. That config leaves `class` attributes containing Twig out of the tree; every `twig-html` rule
still counts them, checks their quotes and leaves their values alone.

## Rules

| Rule | Description | Recommended | Fixable |
|---|---|---|---|
| [`attrs-newline`](docs/rules/attrs-newline.md) | Put each attribute of a tag with many attributes on its own line | warn | yes |
| [`indent`](docs/rules/indent.md) | Indent HTML and Twig blocks one step per level of nesting | warn | yes |
| [`multiline-html-element-content-newline`](docs/rules/multiline-html-element-content-newline.md) | Require a line break before and after the content of a multi-line element | warn | yes |
| [`quotes`](docs/rules/quotes.md) | Use double quotes around HTML attribute values and single quotes around Twig strings, each configurable | warn | yes |


## Known limitations

Gaps in a single rule are listed on its page. These cut across rules:

- **Elements opened or closed in different Twig branches** are never fixed across a branch, by any rule.
- **Open tags missing their `>`** are a parsing error, except when an unquoted value runs into the next tag
  (`<li id=b<span>`), where the parser swallows the markup after it. The rules never fix those.
- Other limits come from the parser: see
  [its known limitations](https://github.com/alannapieralski/twig-lint/tree/main/packages/twig-eslint-parser#known-limitations).

## Licence

Apache License 2.0. See [LICENSE](LICENSE).
