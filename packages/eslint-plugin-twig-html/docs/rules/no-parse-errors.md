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
| `duplicate-attribute` | A tag sets an attribute name that an earlier attribute of the tag already has, ignoring case. Browsers keep the first. Attributes in a Twig branch and attributes with Twig in the name are never compared. | `<div class="a" class="b">` |
| `eof-in-comment` | A comment has no `-->` before the end of the file. | `<!-- note` |
| `eof-in-tag` | An open or closing tag has no `>` before the end of the file. | `<div class="a"`, `<p>a</p` |
| `unexpected-character-in-attribute-name` | An attribute name holds a quote or `<`, usually because an earlier value was quoted wrongly or the `=` before a value is missing. | `<li class="a' data-x="y">`, `<button type"button">` |
| `unexpected-character-in-unquoted-attribute-value` | An unquoted value holds a quote or `<`, so the tag takes in the markup after it. | `<li id=b<span>x</span></li>` |
| `unexpected-solidus-in-tag` | A `/` in an open tag is not followed by `>`, and no attribute before it holds a stray quote or `<`. The browser ignores it, but the parser does not read the attributes after it. | `<img src="a" / >` |
| `x-invalid-end-tag` | A closing tag matches no open element. The message names the element that is open there, if any. | `<p>a</p></div>` |
| `x-unclosed-element` | An element that needs a closing tag never gets one, including a `<script>`, `<style>`, `<textarea>` or `<title>` that takes in the rest of the file. | `<div><p>a</p>` |
| `x-misplaced-twig-tag` | `{% else %}`, `{% elseif %}` or `{% plural %}` sits where Twig rejects it: `else` outside `if`, `for` and `guard`, `elseif` outside `if`, `plural` outside `trans`, or `else` and `elseif` after an `else`. | `{% if a %}{% else %}{% elseif b %}{% endif %}` |
| `x-unparsed-twig` | Twig itself rejects a `{{ }}` or `{% %}` block, such as two values in a row, a missing comma between array items, a comma outside brackets, a `{% for %}` with no `in` or with an `if`. The parser reads the block with Twig's grammar, so the message is the one Twig gives. No other rule reads inside it. | `{{ title subtitle }}` |

Each open tag gets at most one report, for the first problem in the order the tag is read: a stray
character in an attribute comes before a `/` that does not end the tag. Duplicate attributes are
reported only on a tag that was read cleanly, and once for each repeat. Each report names its code in
brackets, so a code can be switched off by name.

### Working with other rules

- **The other `twig-html` rules never fix a tag with `eof-in-tag`,
  `unexpected-character-in-attribute-name`, `unexpected-character-in-unquoted-attribute-value` or
  `unexpected-solidus-in-tag`.** `quotes` and `attrs-newline` may still report it without a fix, and
  `indent` and `multiline-html-element-content-newline` leave the element's content alone.
- **A comment or raw-text element that runs to the end of the file holds the rest of the file as its
  text**, as in a browser, so the other rules leave that text alone. `indent` also leaves alone a
  tag cut off by the end of the file.
- **`x-unparsed-twig` is the only report of a Twig block the parser could not read.** Such a block is
  left out of the tree, so `eslint-plugin-twig-tailwind` never sees the classes inside it.

## What it skips

### Left alone

| Skipped | Why | Setting |
|---|---|---|
| The closing tag of a void element, such as `</link>` or `</br>` | RSS and other XML templates close elements that HTML leaves open | Built in |
| An element whose end tag HTML lets you leave out (`li`, `p`, `td`, `tr`, `option` and the like) | The browser closes it | Built in |
| A closing tag inside `{% if %}`, `{% for %}`, `{% guard %}` or `{% trans %}`, and an element that opens or closes in a branch of one | The markup there may render differently or not at all, and the parser reads every branch as one document, so it cannot tell which branch closes the element | Built in |
| A closing tag inside `{% verbatim %}`, and an element that opens or closes across its edge | Its content is usually client-side template syntax, such as Handlebars or Mustache, whose own conditions can open an element in one branch and close it in another | Built in |
| A closing tag named like an element that an earlier closing tag closed across one of the blocks above, so that the element opens on one side of the block's edge and closes on the other | The branch may have taken the element this tag was meant to close | Built in |
| A problem whose code is switched off | You chose not to hear about it | Each code, default `true` |

### Not checked at all

- **Unknown Twig tags, filters, functions and tests.** Which ones exist depends on the extensions the
  site loads, such as Drupal's modules, so they cannot be known from the template.
- **Errors that stop the parser.** The parser throws, ESLint shows one parsing error for the file, and
  no rule runs: Twig that cannot be tokenised (an unclosed `{{`, `{%`, `{#`, bracket or string), Twig
  tags that do not pair up (a stray `{% endif %}`), and an open tag whose `>` is missing before the
  next tag (`<div class="a"<p>`).
- **An HTML element written as self-closing, such as `<div />`.** The parser reads `/>` as closing
  any element, as the XML templates Drupal renders (RSS, OPML) need, so a closing tag after it is
  reported as `x-invalid-end-tag`, not the `/`. When an earlier tag of that name ended with `/>`, the
  message names it, because browsers ignore `/>` on such an element and keep it open.

### Known gaps

- **Markup problems inside `{% if %}`, `{% for %}` and the other branching blocks are not reported**,
  because the parser reads every branch as one document.
- A missing space between attributes is not reported.
- `<<li` loses the attributes of the `li`, and nothing is reported.
- A quote closed much later by another value's quote is only reported when it leaves a stray quote
  in an attribute name or an unquoted value.
- A tag that takes in the markup after it leaves that markup's closing tags unmatched, so
  `x-invalid-end-tag` follows the first report.

## Options

| Option | Default | Description |
|---|---|---|
| `duplicate-attribute` | `true` | Report an attribute whose name an earlier attribute of the tag already has. |
| `eof-in-comment` | `true` | Report comments with no `-->` before the end of the file. |
| `eof-in-tag` | `true` | Report tags with no `>` before the end of the file. |
| `unexpected-character-in-attribute-name` | `true` | Report attribute names that hold a quote or `<`. |
| `unexpected-character-in-unquoted-attribute-value` | `true` | Report unquoted values that hold a quote or `<`. |
| `unexpected-solidus-in-tag` | `true` | Report a `/` in an open tag that is not followed by `>`. |
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
| Reports `duplicate-attribute` and `missing-whitespace-between-attributes` | Reports `duplicate-attribute`, except in a Twig branch. Does not report `missing-whitespace-between-attributes` yet |
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
