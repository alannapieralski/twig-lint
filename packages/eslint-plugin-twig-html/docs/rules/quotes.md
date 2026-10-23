# twig-html/quotes

Enforce one quote style for HTML attribute values and another for Twig strings.

Enabled as a warning in `configs.recommended`. Fixable.

## Rule details

### Overview

A Twig template holds two kinds of quoted text, and this rule sets the style of each separately:
HTML attribute values get double quotes by default, and Twig string literals get single quotes. With
the defaults, a Twig string inside an attribute never uses the attribute's quote, so
`class="{{ 'a' }}"` reads clearly.

Examples of **incorrect** code:

```twig
<a class='flex' href={{ url }}>{{ "Home"|t }}</a>

{% include "@theme/card.html.twig" with { "title": title } %}
```

Examples of **correct** code:

```twig
<a class="flex" href="{{ url }}">{{ 'Home'|t }}</a>

{% include '@theme/card.html.twig' with { 'title': title } %}

<a title='Say "hi"'>{{ "it's" }}</a>
```

### HTML attribute values

- **Every attribute of every tag** is checked, except on `<script>` and `<style>`. Attributes left
  out of the AST by the parser option `ignoreInterpolatedAttributes`, such as `class` under
  `eslint-plugin-twig-tailwind`'s recommended config, are still checked.
- **Twig inside a value is opaque to HTML.** In `class='{{ "a" }}'` only the outer quotes are HTML
  quotes, so the rule never reads quotes inside Twig as part of the value.
- **Unquoted values** (`class=flex`, `data-id={{ id }}`) are reported. A value is wrapped in the HTML
  quote only when it is plain text without quotes, `=`, `<`, `>` or backticks.

### Twig strings

Every string the Twig lexer reads is checked. That includes:

- **Tags that never become JavaScript nodes**, such as `{% extends %}`, `{% import %}`, `{% trans %}`
  and `{% cache %}`.
- **Hash keys.**
- **Strings inside `#{ }` interpolation**, each checked on its own.
- **Twig inside `<script>`, `<style>` and HTML comments.**

### Escapes

- **Switching quotes removes escapes that are no longer needed**, so `'it\'s'` becomes `"it's"`.
- **Other escapes are kept**, such as `\n` or `\x41`, because they mean the same in both kinds of
  string.
- **The rule never adds an escape**, so a string that would need one is left alone.

## What it skips

### Left alone

The rule never changes what a template renders. It does not report:

| Skipped | Why | Setting |
|---|---|---|
| A value or string that contains the wanted quote, such as `title='say "hi"'` or `{{ "it's" }}` | Switching would need an escape | Built in |
| With `twig: 'single'`, a double-quoted Twig string that interpolates, such as `"a #{b}"` | Only double quotes interpolate | Built in |
| With `twig: 'double'`, a single-quoted Twig string containing `#{` | Double quotes would start interpolating it | Built in |
| Attributes of `<script>` and `<style>` tags | The elements are left as written | Built in |
| Quotes in text, comments, `<script>` and `<style>` content, and `<textarea>` and `<title>` text, and DOCTYPE identifiers | They have no meaning to HTML | Built in |
| Strings in `{# #}` comments and `{% verbatim %}` | They are text to Twig | Built in |

### Reported but not fixed

- **An attribute whose value opens a Twig block that another attribute closes**, such as
  `class='a{% if x %}' data-x='{% endif %}'`. Fixing one half on its own would split the branch.
- **A quoted value holding Twig that prints**, such as `{{ x }}`, `{{ 'Say "hi"'|t }}`, `|raw` or
  `{% include %}`. Drupal markup, `|raw` and included templates are not escaped and may print the new
  quote. Only comments and `if` and `for` tags (with their `else`, `elseif` and end tags) are allowed
  around the value's text.
- **An unquoted value holding any Twig**, such as `data-id={{ id }}` or
  `class={% if a %}"a"{% else %}'b'{% endif %}`, since that Twig may print spaces, attributes or quotes
  of its own.
- **An attribute in an open tag the parser could not read cleanly**, such as `<li id=b<span>`, where
  the `li` open tag has no `>` of its own, or a tag with a quote left in an attribute name, since the
  parser has misread where that tag ends. [`no-parse-errors`](no-parse-errors.md) reports the tag
  itself.

## Options

| Option | Default | Description |
|---|---|---|
| `html` | `'double'` | `'double'` or `'single'`: the quote around HTML attribute values. |
| `twig` | `'single'` | `'single'` or `'double'`: the quote around Twig strings. |

```js
'twig-html/quotes': ['warn', { html: 'double', twig: 'single' }],
```

## Compared with `@html-eslint/quotes`

The HTML half follows [`@html-eslint/quotes`](https://html-eslint.org/docs/rules/quotes). Checked against
`@html-eslint/eslint-plugin` 0.67 running on Twig through `twig-eslint-parser`:

| | `@html-eslint/quotes` | `twig-html/quotes` |
|---|---|---|
| Options | `'double'` or `'single'`, then `enforceTemplatedAttrValue` | `{ html, twig }` |
| Default HTML quote | Double | Double |
| Value containing the wanted quote | Left alone | Left alone |
| Unquoted value | Reported and wrapped | Reported, and wrapped when that cannot change the output |
| Value containing a template | Skipped unless `enforceTemplatedAttrValue`, which then fixes `class='{{ x }}'` whatever the Twig prints | Always checked, but fixed only when the Twig cannot print a quote: `class='a{% if b %}c{% endif %}'` is fixed, `class='{{ x }}'` is only reported |
| Twig strings | Not read | Checked with their own style |

## Testing

- `test/quotes.test.ts` covers both options for each kind of quote, removing escapes, every case the
  rule leaves alone or reports without fixing, Twig in tags that never become JavaScript, raw text,
  comments, `verbatim` and attributes left out by `ignoreInterpolatedAttributes`.
- `test/fix-safety.test.ts` fixes every parser fixture with the default and the opposite options, and
  checks the result changes only HTML quotes, Twig string delimiters and quote escapes, still parses,
  and has as many Twig strings and interpolations as before.
- `npm run corpus -- --rule twig-html/quotes` does the same for real templates. The `quotes.html.twig`
  canary checks the fixed output exactly.
