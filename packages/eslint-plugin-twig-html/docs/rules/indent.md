# twig-html/indent

Indent HTML and Twig blocks one step per level of nesting.

Enabled as a warning in `configs.recommended`. Fixable.

## Rule details

### Overview

Each line is indented one step for every element and every Twig block it sits inside. Each line's
indentation is worked out from scratch, so a deeply wrong tree is fixed in one pass, and the fix
replaces the whole leading whitespace of the line.

Examples of **incorrect** code:

```twig
<ul>
{% for item in items %}
<li>{{ item }}</li>
{% endfor %}
</ul>

{% if url %}
    <a
    href="{{ url }}"
    class="link"
        >{{ label }}</a>
{% endif %}
```

Examples of **correct** code:

```twig
<ul>
  {% for item in items %}
    <li>{{ item }}</li>
  {% else %}
    <li>{{ 'No items'|t }}</li>
  {% endfor %}
</ul>

{% if url %}
  <a
    href="{{ url }}"
    class="link"
  >{{ label }}</a>
{% endif %}

<div class="card"
     id="card-{{ id }}">
</div>
```

### HTML elements

- **Children:** one step in from their element. The closing tag is in line with the opening tag.
- **Text:** every line of multi-line text is at the child indent.
- **`title`:** its text is indented like other content, because browsers trim it. Listing `title` in
  the parser's `rawContentTags` leaves it alone instead.

### Twig blocks

- **Body of a block:** one step in from the opening tag, for `if`, `for`, `block`, `embed`, `macro`,
  `apply`, block-form `set`, Drupal's `trans` and any other tag closed by `end<name>`.
- **Branches and the end tag:** `else`, `elseif`, `plural` (in a Drupal `trans`) and the `end` tag are
  in line with the opening tag.
- **Short forms:** an inline `set` and the short `{% block title page_title %}` have no body, so they
  add no level.
- **Inside `{ }`, `[ ]` and `( )` in multi-line `{{ }}` and `{% %}`:** a line is one step in from
  the line that opened the innermost bracket, and a line that starts with the closing bracket lines up
  with the line that opened it. The opening line keeps whatever indentation it has, so `.addClass([`
  on a continuation line works. A closing bracket is left alone when it ends one argument of a call
  that has more arguments after it. This covers the parameters of
  `{% include 'x' with { ... } %}`, hashes and arrays:

  ```twig
  {% include 'card.twig' with {
    title: title,
    items: [
      first,
      second,
    ],
  } only %}

  {% set attributes = attributes
    .addClass([
      'card',
      'card--wide',
    ])
  %}
  ```
- **Method chains in `{{ }}` and `{% %}`:** a line starting with `.name` is one step in from the line
  that starts the chain, inside brackets or not. A closing bracket does not start a new chain, so
  `.setAttribute()` after `])` stays level with `.addClass([`:

  ```twig
  {% include 'icon.twig' with {
    attributes: create_attribute()
      .addClass(['icon'])
      .setAttribute('aria-hidden', 'true'),
    size: 'md',
  } only %}
  ```

### Attributes and close brackets

- **Attributes on their own line:** one step in from the tag (the `attribute` option).
- **First attribute on the tag's line:** the other attributes line up with it. With
  `alignAttributesVertically: false` they are indented `attribute` steps from the tag instead. Twig
  touching the tag name, as in `<div{{ attributes }}`, is part of the tag, not a first attribute.
- **A `>` or `/>` on its own line:** in line with the tag (the `closeBracket` option).

### Working with other rules

`twig-html/attrs-newline` and `twig-html/multiline-html-element-content-newline` only insert line
breaks, starting each new line at the indentation of the tag's line. This rule indents those lines
one step further where needed, on the next fix pass. Keep it on with them, otherwise new attribute
lines and moved content stay at the tag's own indentation.

## What it skips

### Left alone

These lines keep whatever indentation the author wrote:

| Skipped | Why | Setting |
|---|---|---|
| Content of `pre` and `textarea`, including the line of their closing tag | Whitespace there is content | Built in |
| Content of any element named in the parser's `rawContentTags` option, including the line of its closing tag | Whitespace there is content | `rawContentTags`, a parser option |
| Content of `script` and `style`. Their closing tags are still indented | The content is code | Built in |
| Content of any element named in `ignores`. Their closing tags are still indented | Elements you choose to leave alone | `ignores`, default `[]` |
| Inner lines of a multi-line attribute value | `eslint-plugin-twig-tailwind` wraps `class` values and owns their layout | Built in |
| Inner lines of a multi-line Twig or HTML comment | A comment is free text | Built in |
| Lines that start inside a multi-line Twig string | The whitespace is part of the string | Built in |
| Lines of a multi-line `{{ }}` or `{% %}` that are not inside brackets and not a method chain, such as a `?` continuation, a long condition or the closing `%}` | How to wrap the rest of an expression is left to the author | Built in |
| Inner lines of Twig that starts inside a skipped region, such as a multi-line attribute value | The region owns its layout | Built in |
| The bodies of `{% verbatim %}` and `{% raw %}` | Twig prints them as written | Built in |
| YAML front matter between `---` lines at the top of the file, as in Drupal help topics | It is not markup | Built in |

### Not checked at all

- **Elements opened and closed in different Twig branches**, such as a conditional wrapper:

  ```twig
  {% if url %}<a href="{{ url }}">{% endif %}
    <span>{{ label }}</span>
  {% if url %}</a>{% endif %}
  ```

  The parser cannot build one tree for both branches, so the lines inside that element, and the Twig
  tags that wrap it, are not checked. Lines before and after them are.
- **A tag whose own markup a Twig branch splits**, such as one ending in `>` in one branch and `/>` in
  another. The whole tag is left alone, its first line included.
- **An open tag with no `>` at the end of the file, and markup swallowed by an unquoted attribute
  value** that runs into the next tag (`<li id=b<span>`). Anywhere else a missing `>` is a parsing
  error and no rule runs.
- **The content of an element that is never closed**, meaning an element with no closing tag that holds
  other nodes. In `<ul><li>a<li>b</ul>` the second `li` becomes a child of the first, so its content
  is skipped. The parser cannot tell where these elements end.

Where the depth is unknown, the rule cannot say how many levels deep a line is, so it skips the
content. It can still lay out a tag's own attribute lines and closing `>`, because they are measured
from the line the tag starts on: the indentation that line already has is the base, and each attribute
line is one step further in. A tag that `attrs-newline` splits is therefore laid out like any other.
In this example `<p>` is never closed, so `text` and the `<i` line are left as written, but the
attributes and `>` are placed from the `<i` line:

```twig
<div>
  <p>
      text
    <i
      class="a"
      id="b"
    >x</i>
</div>
```

### Known gaps

- **Operators and continuation lines are not laid out.** A line outside any bracket that is not a
  method chain, such as `? 'a'`, `|filter` or the second line of a long `and` condition, keeps the
  author's indentation.

## Options

The first option is the indent size: a whole number of spaces of at least 1 (default `2`) or `'tab'`.
The second is an object:

| Option | Default | Description |
|---|---|---|
| `attribute` | `1` | Steps an attribute on its own line is indented from the tag. |
| `closeBracket` | `0` | Steps a `>` or `/>` on its own line is indented from the tag. A number sets all three; an object sets `startTag` (`>`), `selfClosingTag` (`/>`) and `endTag` (the `>` of a closing tag) one by one, each defaulting to `0`. |
| `alignAttributesVertically` | `true` | When the first attribute is on the tag's line, line the other attributes up with it. When `false`, they are indented `attribute` steps from the tag. |
| `ignores` | `[]` | Leave the content of these elements alone, matched by name. Their opening and closing tags are still indented. |

```js
'twig-html/indent': ['warn', 4, { closeBracket: { selfClosingTag: 1 }, ignores: ['svg'] }],
```

## Compared with `vue/html-indent`

The rule follows `vue/html-indent`, which indents `<template>` in `.vue` files. `@stylistic/indent`
only indents JavaScript, so it does not apply to templates. Checked against the `flat/recommended`
preset of eslint-plugin-vue 10:

| | `vue/html-indent` | `twig-html/indent` |
|---|---|---|
| Indent size | `2` | `2` |
| `attribute`, `closeBracket`, `alignAttributesVertically` | `1`, `0`, `true` | Same |
| Ignoring elements | `ignores`: AST selectors, so an element can be ignored by attribute or position | `ignores`: element names only |
| `baseIndent` | `1`: children of `<template>` are indented | Not needed: Twig templates have no root wrapper, so top-level content is at column 0 |
| Twig and Vue blocks | `v-if` lives on the element, so blocks add no level | Every Twig block body adds a level |
| Expressions inside `{{ }}` | Indented like JavaScript | Lines inside `{ }`, `[ ]` and `( )` are indented one step from the line that opened them, and `.method()` chains one step from the line that starts them; other lines are left alone (see Known gaps) |
| Comments before a closing tag | May line up with the line above or the closing tag | Indented like the content around them |
| Message | `Expected indentation of 2 spaces but found 0 spaces.` | Same |

## Compared with `@html-eslint/indent`

Checked against `@html-eslint/eslint-plugin` 0.67 running on Twig through `twig-eslint-parser`:

| | `@html-eslint/indent` | `twig-html/indent` |
|---|---|---|
| Default indent size | `4` | `2` |
| Twig blocks | Not known: the lines inside `{% if %}` and `{% for %}` stay at the level of the Twig tag | The body of every Twig block is one step in |
| Attribute option | `Attribute` (at least 1, default 1) | `attribute` (at least 0, default 1) |
| Other options | `tagChildrenIndent`, `ignoreComment`, `templateIndentBase` | `closeBracket`, `alignAttributesVertically`, `ignores` |
| Elements left alone | `pre` and `xmp`, including their own tag lines | The content of `pre`, `textarea`, `script` and `style`, plus `ignores`; their tags are still indented |
| `script` and `style` content | Left alone | Left alone |
| Multi-line `include` parameters | Inner lines left alone | Indented one step from the line that opened the bracket |

## Testing

- `test/indent.test.ts` covers nested HTML, Twig blocks with `else` and `elseif`, block, embed and
  block-form set, inline set and the short block form, whitespace control, multi-line Twig
  brackets, method chains and include parameters, verbatim,
  unpaired Twig, conditional wrappers and elements split across branches, each attribute and close
  bracket option, Twig between attributes, multi-line attribute values, `pre`, `textarea`, `title`,
  `rawContentTags`, `script`, `style`, `ignores`, open tags missing their `>`, tabs, other sizes,
  Windows line endings, front matter and fixing a deep tree in one pass.
- `test/fix-safety.test.ts` fixes every parser fixture and checks the result changes only whitespace
  and still parses.
- `npm run corpus -- --rule twig-html/indent` does the same for real templates. The canary
  `tools/corpus/canaries/indent.html.twig` must report and fix to `indent.expected`.
