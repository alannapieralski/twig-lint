# twig-html/no-parse-errors

Report markup and Twig the parser read past but that a browser or Twig would treat as an error.

Enabled as a warning in `configs.recommended`. Not fixable.

## Rule details

### Overview

The parser does not stop at every mistake. It reads on, notes the mistake in the `diagnostics` list
of its services, and the other `twig-html` rules skip what they cannot read safely, such as an open
tag with no `>`. This rule reports each noted mistake, so a skipped tag or block is never silent.

Examples of **incorrect** code:

```twig
<ul class="list">
  <li>One</li>
</div>

<p>{{ title subtitle }}</p>

{% if items %}
  <p>{{ item }}</p>
{% else %}
  <p>None</p>
{% elseif other %}
{% endif %}
```

Examples of **correct** code:

```twig
<ul class="list">
  <li>One
  <li>Two
</ul>

<p>{{ title ~ subtitle }}</p>

{% if items %}
  <p>{{ item }}</p>
{% elseif other %}
  <p>{{ other }}</p>
{% else %}
  <p>None</p>
{% endif %}
```

### Which problems are reported

Codes without a prefix are the names the HTML specification gives the error. Codes that start with
`x-` are the parser's own.

| Code | Reported when | Example |
|---|---|---|
| `eof-in-tag` | An open tag has no `>` before the end of the file. | `<div class="a"` |
| `unexpected-character-in-attribute-name` | An attribute name holds a quote or `<`, usually because an earlier value was quoted wrongly. | `<li class="a' data-x="y">` |
| `unexpected-character-in-unquoted-attribute-value` | An unquoted value holds a quote or `<`, so the tag swallows the markup after it. | `<li id=b<span>x</span></li>` |
| `x-invalid-end-tag` | A closing tag matches no open element. | `<p>a</p></div>` |
| `x-unclosed-element` | An element that needs a closing tag never gets one. | `<div><p>a</p>` |
| `x-misplaced-twig-tag` | `{% else %}`, `{% elseif %}` or `{% plural %}` sits where Twig rejects it: `else` outside `if`, `for` and `guard`, `elseif` outside `if`, `plural` outside `trans`, or `else` and `elseif` after an `else`. | `{% if a %}{% else %}{% elseif b %}{% endif %}` |
| `x-unparsed-twig` | A `{{ }}` or `{% %}` block holds an expression that is not valid Twig, or a `{% for %}` has no `in`. No other rule reads inside it. | `{{ title subtitle }}` |

Each report names its code in brackets, so a code can be switched off by name.

### Which errors stop the parser

These are not reported by this rule. The parser throws, ESLint shows one parsing error for the file,
and no rule runs:

- **Twig that cannot be tokenised**, such as an unclosed `{{`, `{%`, `{#`, bracket or string.
- **Twig tags that do not pair up**, such as a stray `{% endif %}` or an `{% if %}` that is never
  closed.
- **An open tag whose `>` is missing before the next tag**, such as `<div class="a"<p>`.

### Working with other rules

- **The other `twig-html` rules skip a tag with one of the first three codes.** They report nothing
  inside it that they could not fix safely, and never fix it.
- **`x-unparsed-twig` is the only report of a Twig block the parser could not read.** Such a block is
  left out of the tree, so `eslint-plugin-twig-tailwind` never sees the classes inside it.

## What it skips

### Left alone

| Skipped | Why | Setting |
|---|---|---|
| The closing tag of a void element, such as `</link>` after `<link>` | RSS and other XML templates close elements that HTML leaves open | Built in |
| An element whose end tag HTML lets you leave out (`li`, `p`, `td`, `tr`, `option` and the like) | The browser closes it | Built in |
| An element that opens or closes inside a Twig block that another branch balances | The parser reads the markup as one document, so it cannot tell which branch closes it | Built in |
| Every closing tag in a file where one stands inside a Twig block, once the markup pairs across Twig branches | The parser cannot tell which closing tag is the extra one | Built in |
| A problem whose code is switched off | You chose not to hear about it | Each code, default `true` |

### Not checked at all

- **Unknown Twig tags, filters, functions and tests.** Which ones exist depends on the extensions the
  site loads, such as Drupal's modules, so they cannot be known from the template.

### Known gaps

- **Markup problems inside Twig blocks are mostly not reported.** The parser reads the markup as one
  document, so it cannot pair an element opened in one `{% if %}` branch with a closing tag in
  another, and the rule stays quiet rather than guess (see the two Left alone rows about Twig branches). In practice
  a closing tag is never reported as `x-invalid-end-tag` while any Twig block is open before it,
  `{% if %}`, `{% for %}` and `{% block %}` included, so a template whose markup sits inside
  `{% block %}` gets almost no end tag reports. Fixing this needs the parser to read the markup of
  each Twig branch separately; the `blocks` service's `depthChange` shows where the branches are.
- Duplicate attributes and a missing space between attributes are not reported.
- An unterminated `<!--` drops the markup after it, so the elements it left open are reported instead
  of the comment.
- `<<li` loses the attributes of the `li`, and nothing is reported.
- A quote closed much later by another value's quote is only reported when it leaves a stray quote
  in an attribute name or an unquoted value.
- A tag that swallows the markup after it leaves that markup's closing tags unmatched, so
  `x-invalid-end-tag` follows the first report.

## Options

| Option | Default | Description |
|---|---|---|
| `eof-in-tag` | `true` | Report open tags with no `>` before the end of the file. |
| `unexpected-character-in-attribute-name` | `true` | Report attribute names that hold a quote or `<`. |
| `unexpected-character-in-unquoted-attribute-value` | `true` | Report unquoted values that hold a quote or `<`. |
| `x-invalid-end-tag` | `true` | Report closing tags that match no open element. |
| `x-misplaced-twig-tag` | `true` | Report `else`, `elseif` and `plural` tags in the wrong place. |
| `x-unclosed-element` | `true` | Report elements that never get a closing tag. |
| `x-unparsed-twig` | `true` | Report Twig blocks the parser could not read. |

```js
export default [
  twigHtml.configs.recommended,
  { files: ['**/*.twig'], rules: { 'twig-html/no-parse-errors': ['warn', { 'x-unclosed-element': false }] } },
];
```

## Compared with `vue/no-parsing-error`

| `vue/no-parsing-error` | `twig-html/no-parse-errors` |
|---|---|
| Reports HTML specification errors under the specification's names | The same names for the errors it reads |
| One boolean option per code, on by default | The same |
| Reports `duplicate-attribute` and `missing-whitespace-between-attributes` | Does not yet |
| Does not report an unclosed element such as `<div><p>x` | Reports it as `x-unclosed-element`, except where HTML lets the end tag go or a Twig branch splits the element |
| Reports the closing tag of a void element (`</br>`) as `x-invalid-end-tag` | Skips it, for RSS templates |
| Reports errors in the expressions inside `{{ }}` | Reports them as `x-unparsed-twig`, and Twig tags that sit in the wrong place |
| Part of every recommended preset, as an error | A warning in `configs.recommended` |

## Testing

- `test/no-parse-errors.test.ts` lints each code, switches one off and checks the option schema.
- The parser's `test/parser/diagnostics.test.ts` covers when each code is raised and when it stays quiet.
- `npm run corpus -- --rule twig-html/no-parse-errors --sample 20` runs it on real templates.
- The templates in `tools/corpus/canaries/broken` are broken on purpose and listed in
  `expectations.json` with the lines this rule must report.
