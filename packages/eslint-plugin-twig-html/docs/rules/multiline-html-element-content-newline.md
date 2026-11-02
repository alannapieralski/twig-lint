# twig-html/multiline-html-element-content-newline

Require a line break before and after the content of a multi-line element.

Enabled as a warning in `configs.recommended`. Fixable.

## Rule details

### Overview

An element is multi-line when its closing tag starts on a later line than its opening tag. Its
content then goes on lines of its own, with a line break after the `>` of the opening tag and one
before the closing tag. This is the layout `twig-html/attrs-newline` produces for a tag with
several attributes, so the two rules finish each other's job.

Examples of **incorrect** code:

```twig
<h2
  id="system-breadcrumb"
  class="sr-only"
>You are here:</h2>

<ul
  class="list"
  id="menu"
><li>{{ item }}</li></ul>

<p>Some
  text</p>
```

Examples of **correct** code:

```twig
<h2
  id="system-breadcrumb"
  class="sr-only"
>
  You are here:
</h2>

<div
  class="swiper-pagination"
></div>

<div
  class="swiper-pagination"
>
</div>

<h2 id="a">Elements on one line stay as they are</h2>
```

### What counts as multi-line

- **Measured from the tags, not the content.** The element is multi-line when its closing tag starts on
  a later line than its opening tag, however short the content is.
- **Text is content.** A multi-line `<h2>` holding only text is fixed too, like an element that holds
  other elements.

### What the fix does

- **At least one line break at each edge.** A missing one is added. Blank lines are allowed by
  default; with `allowEmptyLines: false`, more than one line break is reduced to exactly one.
- **Whitespace-only content is not empty.** With `allowEmptyLines: false` it is reduced to one line
  break, so `>\n\n</div>` becomes `>\n</div>`. Content with no characters at all is the empty case: see
  `ignoreWhenEmpty`.
- **Only HTML whitespace is changed** (space, tab, line feed, carriage return and form feed), so a
  non-breaking space at the edge of the content is kept.
- **Indentation:** a line it creates starts at the indentation of the tag's line, and when it removes
  blank lines it keeps the indentation already there.
- **Line endings:** the file's line endings are used, so `\r\n` stays `\r\n`.

### Which elements are fixed

- **Elements whose edge whitespace browsers do not render:** `div`, `p`, `li`, `table` and its parts,
  headings, `button`, `select` and its `option`s, `title` and SVG containers, among others. A `title` is fixed even though the
  parser reads its content as raw text, because browsers trim it.
- **Other elements** are reported but not fixed: see What it skips.

### Working with other rules

[`twig-html/indent`](indent.md) indents the content on the next fix pass, so keep it on with this
rule, as `configs.recommended` does.

## What it skips

### Left alone

| Skipped | Why | Setting |
|---|---|---|
| An element that starts and ends on one line | It is not multi-line, however long its content | Built in |
| An empty element (`></div>`) | Nothing to move. With the setting off, a multi-line `></div>` becomes `>\n</div>` | `ignoreWhenEmpty`, default `true` |
| Inline elements (`a`, `span`, `strong`, `label`, `svg` and the like), and everything inside them | A line break may render as a space. With the setting off, `svg` is laid out | `ignoreInlineElements`, default `true` |
| Elements in `ignores`, and everything inside them | Elements you choose to leave alone | `ignores`, default `[]` |
| `script` and `style`, and everything inside them | They hold code, not markup | Built in |
| `pre` and `textarea`, and everything inside them | Their whitespace is content | Built in |
| Tags whose name is Twig, such as `<{{ element }}>` | Twig may render them as an inline element | Built in |
| Tags with no closing tag, such as `<img>` | They have no content | Built in |
| The body of a Drupal `{% trans %}`, and of its `{% plural %}` section | Drupal builds the translation key from the text between the tags, so any change to its whitespace or quotes loses the stored translations. Only the whitespace at its two edges, which Drupal trims, is changed | Built in |

### Reported but not fixed

- **Elements not known to ignore edge whitespace**, such as custom elements and unknown tags. A line
  break inside an inline element can render as a space. A tag name ends where Twig starts, so
  `<h{{ level }}>` is checked as the unknown tag `h`, and the report names it as written, with the Twig shortened to `{{ … }}`.

### Not checked at all

- **An element inside an element that is never closed**, such as the `<div>` in `<p><div>…</div>`
  with no `</p>`. [`twig-html/indent`](indent.md) cannot know the depth there and leaves the content
  alone, so moving it would leave it at the tag's indentation.
- **An element whose content starts or ends in a different Twig branch from the element**, such as a
  wrapper opened in `{% if wrap %}<div>{% endif %}` and closed in `{% if wrap %}</div>{% endif %}`.
  Moving the edges would move the Twig tags with them. Twig blocks that open and close inside the
  content are fine.
- **An open tag the parser could not read cleanly**: no `>` before the end of the file, a quote or
  `<` left in an attribute name or an unquoted value, or a `/` that does not end the tag. The parser
  misreads where the tag ends. [`no-parse-errors`](no-parse-errors.md) reports the tag itself.

## Options

| Option | Default | Description |
|---|---|---|
| `ignores` | `[]` | Leave these elements, and everything inside them, alone. `pre` and `textarea` are always left alone. |
| `ignoreInlineElements` | `true` | Leave inline elements (`a`, `span`, `strong`, `label`, `svg` and the like), and everything inside them, alone. When `false`, they are checked: `svg` is fixed, and the others are reported but not fixed. |
| `ignoreWhenEmpty` | `true` | Leave elements with no content at all alone. When `false`, `></div>` becomes `>\n</div>`. |
| `allowEmptyLines` | `true` | Allow blank lines around the content. Only a missing line break is reported. When `false`, more than one line break is reduced to one. |

```js
'twig-html/multiline-html-element-content-newline': ['warn', { allowEmptyLines: false }],
```

## Compared with `vue/multiline-html-element-content-newline`

The rule follows `vue/multiline-html-element-content-newline`. Checked against the
`flat/recommended` preset of eslint-plugin-vue 10:

| | `vue` | `twig-html/multiline-html-element-content-newline` |
|---|---|---|
| Options | `ignores`, `ignoreWhenEmpty`, `allowEmptyLines` | Same, plus `ignoreInlineElements`. Vue lists the inline elements in the `ignores` default; here they sit behind `ignoreInlineElements`, and `ignores` starts empty |
| `allowEmptyLines` default | `false` | `true` |
| Multi-line element | Closing tag starts on a later line than the opening tag | Same |
| Message | ``Expected 1 line break after opening tag (`<div>`), but no line breaks found.`` | Same |
| Elements fixed | Every element | Only elements whose edge whitespace browsers do not render; others are reported |
| Indentation after the fix | Replaces the whitespace with a bare line break | Keeps the tag's indentation; `twig-html/indent` indents |
| `pre` and `textarea` | In the `ignores` default, so they can be removed | Always ignored |
| Twig | Not applicable | Skips Twig-named tags and elements whose edges sit in another Twig branch |

## Compared with `@html-eslint/element-newline`

Checked against `@html-eslint/eslint-plugin` 0.67 running on Twig through `twig-eslint-parser`:

| | `@html-eslint/element-newline` | `twig-html/multiline-html-element-content-newline` |
|---|---|---|
| Scope | Every element, even on one line: `<div><p>x</p></div>` is split | Only multi-line elements |
| Text content | Treated as inline: a multi-line `<h2>` with only text is left alone | Moved onto its own lines |
| Child elements | A line break after the opening tag when a child element is not in `inline` (none are by default) | One line break at each edge of any multi-line element |
| Options | `inline`, `skip` | `ignores`, `ignoreInlineElements`, `ignoreWhenEmpty`, `allowEmptyLines` |
| Elements left alone | `pre` and `code` by default | `pre`, `textarea` and inline elements by default |

## Testing

- `test/multiline-html-element-content-newline.test.ts` covers the layout, empty and whitespace-only
  elements, blank lines, each option, each edge fixed on its own, indentation left to `indent`,
  Windows line endings, ignored elements, `pre` and `textarea`, elements that are reported but not
  fixed, Twig branches around the content, custom and unknown tags, tags named by Twig, `script` and
  `style`, the text of a `title`, non-breaking spaces, inline SVG, tags without a closing tag, open
  tags missing their `>` and the interplay with `attrs-newline`.
- `test/fix-safety.test.ts` fixes every parser fixture and checks the result changes only whitespace
  and still parses.
- `npm run corpus -- --rule twig-html/multiline-html-element-content-newline` does the same for real
  templates.
