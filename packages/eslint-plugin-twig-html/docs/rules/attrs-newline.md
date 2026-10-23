# twig-html/attrs-newline

Put each attribute of a tag with many attributes on its own line.

Enabled as a warning in `configs.recommended`. Fixable.

## Rule details

### Overview

A tag with more attributes than `ifAttrsMoreThan` (by default 1, so two or more) is laid out with one
attribute per line, and its closing `>` or `/>` goes on its own line. The rule only places line
breaks: [`twig-html/indent`](indent.md) indents the lines it creates.

Examples of **incorrect** code:

```twig
<button type="button" class="flex items-center" aria-controls="accordion-{{ id }}">

<button type="button"
        class="flex items-center"
        aria-controls="accordion-{{ id }}">
```

Examples of **correct** code:

```twig
<button
  type="button"
  class="flex items-center"
  aria-controls="accordion-{{ id }}"
>

<a href="{{ url }}">
```

### What counts as one attribute

The rule counts the attributes the parser gives it:

- **HTML attributes:** every one, including those whose value contains Twig (`id="item-{{ id }}"`).
- **A print separated from the previous token by whitespace**, such as `<div {{ attributes }} class="a">`.
  It counts as one attribute and moves to its own line. This renders the same HTML.
- **Twig touching the end of the tag name**, such as `<div{{ attributes }}` or `<h{{ level }}`, is part
  of the tag, not an attribute, so it is not counted and stays on the tag's line. Twig output cannot be
  known in advance, and a line break there could split a name the Twig builds. Put a space before it to
  have it counted and moved.
- **A print straight after `<`**, such as `<{{ html_element }}>`, is always the name.
- **Conditional attributes:** `<div {% if id %}id="{{ id }}"{% endif %}>` counts as one.
- **Twig blocks spanning attributes:** `{% if checked %}checked disabled{% endif %}` counts as one and
  stays together on one line, so the block is never split.

Parts of the tag name are never counted and stay on the tag's line.

### Which tags are checked

- **Multi-line attribute values:** kept as they are. Only the whitespace between attributes changes.

### What the fix changes

- **Only whitespace between attributes.** The rule accepts any indentation on the attribute lines.
- **Indentation:** each line the fix creates starts at the indentation of the tag's line, and the fix
  never adds an indent step. `indent` then moves the new lines one step in, with `>` in line with the
  tag.
- **Close bracket:** with `closeStyle: 'sameline'` the `>` stays after the last attribute, and `/>` gets
  one space before it.
- **Line endings:** the line breaks it inserts match the file, so `\r\n` stays `\r\n`.

### Working with other rules

Keep [`indent`](indent.md) on, as `configs.recommended` does. Without it the new attribute lines stay
at the tag's own indentation.

## What it skips

### Left alone

| Skipped | Why | Setting |
|---|---|---|
| Tags at or under the threshold, however they are written | The rule does not normalise them | `ifAttrsMoreThan` |
| Elements in `ignores`, and every tag inside them | Inline SVG puts many short tags on one line, and one attribute per line would make it much longer for no gain | `ignores`, default `['svg']` |
| `<script>` and `<style>` elements | The whole element is left as written | Built in |
| `textarea` and `title` content | It is text, so the rule never reads markup there | Built in |

### Reported but not fixed

- **A tag with anything other than whitespace between two attributes**, such as a Twig comment. A fix
  would have to move or drop it.
- **An open tag that is missing its `>`**, where the parser reads the markup after it as attributes
  (including when it ends up inside an unquoted value). Splitting those "attributes" onto separate
  lines would break the next tag.

### Not checked at all

- **A tag where a Twig block opens or branches without closing inside the tag.** The tag has a
  different shape on each branch.

## Options

| Option | Default | Description |
|---|---|---|
| `ifAttrsMoreThan` | `1` | Lay out a tag once it has more attributes than this. `0` lays out every tag that has an attribute. |
| `closeStyle` | `'newline'` | `'newline'` puts `>` or `/>` on its own line; `'sameline'` keeps it after the last attribute. |
| `ignores` | `['svg']` | Leave tags inside these elements, and the elements themselves, alone. Setting it replaces the list; `[]` lays SVG out too. |

```js
'twig-html/attrs-newline': ['warn', { ifAttrsMoreThan: 2, closeStyle: 'sameline' }],
```

`configs.recommended` skips `**/*.svg.twig` for the same reason the rule leaves inline SVG alone. The
skipped files get no parser either, so to lint them anyway, reuse the recommended config's parser
and `files` setting for them and let the rule into SVG:

```js
// eslint.config.js
import twigHtml from 'eslint-plugin-twig-html';

export default [
  twigHtml.configs.recommended,
  {
    ...twigHtml.configs.recommended,
    files: ['**/*.svg.twig'],
    ignores: [],
    rules: { 'twig-html/attrs-newline': ['warn', { ignores: [] }] },
  },
];
```

## Compared with `vue/max-attributes-per-line`

The rule follows the layout `vue/max-attributes-per-line`, `vue/first-attribute-linebreak` and
`vue/html-closing-bracket-newline` produce, so `.vue` and `.twig` files look alike. Checked against the
`flat/recommended` preset of eslint-plugin-vue 10:

| | `vue` | `twig-html/attrs-newline` |
|---|---|---|
| Tag with more attributes than the threshold | One attribute per line, `>` on its own line | Same layout |
| Indent of attributes | One step from the tag (`vue/html-indent`) | One step from the tag (`twig-html/indent`) |
| Threshold | More than 1 attribute on one line | More than 1 (`ifAttrsMoreThan`) |
| Tag at or under the threshold | Still checked: a multi-line tag is normalised | Left alone, however it is written |
| Attribute order | `vue/attributes-order` reorders them | Never reorders |
| Self-closing void tag (`<img />`) | `vue/html-self-closing` removes the `/` | Keeps `/>` and puts it on its own line |
| Scope of the fix | Line breaks only; `vue/html-indent` indents | Line breaks only; `twig-html/indent` indents |

## Compared with `@html-eslint/attrs-newline`

Checked against `@html-eslint/eslint-plugin` 0.67 running on Twig through `twig-eslint-parser`:

| | `@html-eslint/attrs-newline` | `twig-html/attrs-newline` |
|---|---|---|
| Threshold | More than 2 attributes | More than 1 |
| Options | `ifAttrsMoreThan`, `closeStyle`, `maxLen`, `skip`, `inline` | `ifAttrsMoreThan`, `closeStyle`, `ignores` |
| Indentation | None; left to `@html-eslint/indent` | None; left to `twig-html/indent` |
| Twig block around attributes | Each Twig tag is an attribute of its own, so `{% if %}` and `{% endif %}` get their own lines and the block is split | The block stays together on one line |
| Twig comment between attributes | Dropped by the fix, which rebuilds the tag from the attributes it parsed | Reported, not fixed |
| Inline SVG | Laid out unless `skip` lists `svg` | Skipped by default |

## Testing

- `test/attrs-newline.test.ts` covers the layout, the options, Twig touching the tag name, Twig blocks that span
  attributes, Twig in tag names, multi-line values, inline SVG, Windows line endings, text in
  `textarea`, the unfixable Twig-comment case and open tags missing their `>`.
- `test/fix-safety.test.ts` fixes every parser fixture and checks the result changes only whitespace
  and still parses.
- `npm run corpus -- --rule twig-html/attrs-newline` does the same for real templates, and also checks
  a second pass changes nothing (see the repository README).
