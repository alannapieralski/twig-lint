---
paths:
  - "**/README.md"
  - "packages/*/docs/**/*.md"
---

# Docs structure

## Rule pages (`packages/eslint-plugin-twig-html/docs/rules/<rule>.md`)

Use these headings, in this order. Drop Options when the rule has none. Never add "When not to use
it" or a "Why not ..." heading: comparisons belong in the Compared with table.

```
# twig-html/<rule>
One sentence matching meta.docs.description.
Status line: severity in configs.recommended, fixable or not.

## Rule details
### Overview
### <Category>            one per aspect of the behaviour, broad to narrow
### Working with other rules   only when it applies

## What it skips
### Left alone           a table: Skipped, Why, Setting
### Reported but not fixed
### Not checked at all
### Known gaps            only what is still to build

## Options
## Compared with <model rule>
## Testing
```

### Rule details

- **Overview:** two to four sentences saying what the rule does in plain terms, then the examples
  in `twig` fences: "Examples of **incorrect** code" and "Examples of **correct** code".
- **Categories:** when a rule has HTML and Twig cases (see `rule-folders.md`), name each category after the case it describes. Order them from the most general behaviour to the most specific. Name each after
  the question a reader would ask ("What counts as one attribute", "Which elements are fixed").
- **Bullets:** one behaviour per bullet, starting with a bold lead-in, saying what the rule does
  and why in one or two sentences. About six to eight bullets per category: split a longer one.
- Edge cases that leave something unchecked go under What it skips, not inside Rule details.

### What it skips

- Every entry says what is skipped and why. Left alone means no report. Reported but not fixed
  means a report without a fix. Not checked at all means the rule does not run there.
- **Left alone is a table** with the columns Skipped, Why and Setting. Setting is either the option
  that controls the skip, with its default, or `Built in` when the user cannot change it. Every skip
  is one or the other, so a reader can tell which parts of a file they can bring back.
- An option's default holds only what the option controls. A skip that is always on is built in and
  never sits in a default list, even when the list would show it.
- Every rule option named in the Setting column has a row in the Options table. A parser option
  (`rawContentTags`) is named there and documented in the parser README.
- Reported but not fixed, Not checked at all and Known gaps stay bullets.
- Known gaps lists behaviour that is not built yet, one line each. Delete a line when it is built.
- Omit a subheading that has no bullets.

### Options

A table of option, default and effect, then one config snippet. Every option in the schema is in
the table.

### Compared with

One table per model rule (for example `vue/html-indent` or `@html-eslint/quotes`), with the model on
the left and the rule under comparison on the right, one row per difference or similarity that
matters. Check each row by running the model rule, not from memory. Omit the heading only when no
similar rule exists.

### Testing

Three to five short bullets: the test file and what it covers, the fix-safety test, the corpus
command, and the canary when there is one. No counts, dates or results of runs.

## Package READMEs

Installation, Usage, Rules (a table with one-line descriptions that link to the rule pages),
What each rule skips (a table of where the rules differ, twig-html only), Known limitations (only gaps that cut across rules, one line each with a link), Licence. Rule
detail stays on the rule page.
