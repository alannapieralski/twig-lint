# eslint-plugin-twig-tailwind

Lint Tailwind CSS classes in Twig and Drupal templates. This plugin does nothing without
[`eslint-plugin-better-tailwindcss`](https://github.com/schoero/eslint-plugin-better-tailwindcss),
which it needs as a peer dependency: it is the glue between
[`twig-eslint-parser`](https://github.com/alannapieralski/twig-lint/tree/main/packages/twig-eslint-parser),
which reads Twig, and
[`eslint-plugin-better-tailwindcss`](https://github.com/schoero/eslint-plugin-better-tailwindcss),
which checks the classes. It adds the selectors that find classes inside Twig expressions (and, with an
extra config, Drupal's), and rules that keep Twig out of class values.

```twig
{% set classes = ['gap-fl-sm', 'grid-cols-1'] %}
<div{{ attributes.addClass(classes).addClass('md:grid-cols-2') }}>
  {% include 'numiko:card' with { classes: ['w-full'] } only %}
</div>
```

## Installation

```sh
npm install --save-dev eslint-plugin-twig-tailwind eslint eslint-plugin-better-tailwindcss@4.8.0 tailwindcss
```

Requires Node.js 20.19 or later, ESLint 8.57 or later (flat config) and eslint-plugin-better-tailwindcss 4.8.0.
The package is ESM only. `twig-eslint-parser` is installed with it.

## Usage

```js
// eslint.config.js
import twigTailwind from 'eslint-plugin-twig-tailwind';

export default [
  twigTailwind.createConfig({ drupal: true }), // leave drupal out for plain Twig projects
  {
    files: ['**/*.twig'],
    settings: {
      'better-tailwindcss': { entryPoint: 'src/css/style.css' },
    },
  },
];
```

If better-tailwindcss is not installed, loading the plugin fails with an error that names it.

Each release supports only the better-tailwindcss versions in its `peerDependencies`. A new
better-tailwindcss release is added there once it has been tested, so a newer one may not be
supported yet.

`createConfig()` takes two options, both optional:

| Option | Default | Effect |
|---|---|---|
| `drupal` | `false` | Adds `drupalSelectors`, so Drupal's `addClass()` and `removeClass()` are linted (see [What gets linted](#what-gets-linted)) |
| `selectors` | `[]` | Extra [better-tailwindcss selectors](https://github.com/schoero/eslint-plugin-better-tailwindcss/blob/main/docs/configuration/advanced.md), added to the built-in ones instead of replacing them |

An unknown option, or an option of the wrong type, throws when the config is built.

`twigTailwind.configs.recommended` and `twigTailwind.configs.drupal` are the same configs built
with `createConfig()` and `createConfig({ drupal: true })`.

The config applies to `**/*.twig` and sets:

- `twig-eslint-parser` as the parser, with `ignoreInterpolatedAttributes: ['class']`;
- the `twig-tailwind/twig` processor (see [Interpolated strings](#interpolated-strings));
- better-tailwindcss's selectors plus `twigSelectors`, then `drupalSelectors` and your `selectors`
  when asked for;
- better-tailwindcss's recommended rules, with `enforce-consistent-line-wrapping` limited to HTML
  attributes such as `class=""`. Wrapping a string inside a Twig array or call splits it over
  lines within its quotes, which reads badly, so a long list of classes there is better split
  into more array items by hand;
- [`twig-tailwind/no-twig-interpolation`](docs/rules/no-twig-interpolation.md) as an error.

ESLint merges `settings`, so your `entryPoint` sits next to the selectors instead of replacing
them. Override any rule in your own config object as usual.

### Path aliases

Tailwind resolves `@import` with relative paths and package names only. If your CSS imports
through bundler aliases such as Vite's `@css/...`, point better-tailwindcss's `tsconfig` setting at
a tsconfig whose `paths` define the same aliases, and keep `entryPoint` on your real stylesheet:

```js
settings: {
  'better-tailwindcss': { entryPoint: 'src/css/style.css', tsconfig: 'tsconfig.json' },
},
```

An import Tailwind cannot resolve is loaded as empty without an error, so the classes it defines
are reported as unknown. That is usually the first sign an alias is missing.

## What gets linted

| Twig | Selector |
|---|---|
| `class="..."` without Twig inside | better-tailwindcss defaults |
| `{% set classes = [...] %}`, `{% set title_class = '...' %}`, `{% set bgColorClass = '...' %}` | `twigSelectors`: variables named `classes`, or ending in `_class`, `_classes`, `Class` or `Classes` (not one named just `class`: the parser renames that reserved word) |
| `{% include 'x' with { classes: [...] } %}`, `{ wrapper_classes: '...' }`, `{ attrs: { class: '...' } }` | `twigSelectors`: a hash value under such a key, passed to any function or tag, including `include`, `embed` and `create_attribute()` |
| `{% set classes = classes\|merge([...]) %}` | `twigSelectors`: strings merged into a variable with such a name |
| `attributes.addClass(...)`, `.removeClass(...)`, including every call in a chain | `drupalSelectors` (`drupal: true`): matched by method name, on any object |

better-tailwindcss's default selector for variables named `style` or `styles` is left out, since
in Twig those usually hold inline CSS or a variant name rather than classes.

Not linted: `attributes.setAttribute('class', ...)`, because a selector cannot tell its `class` calls
from every other attribute it sets.

To lint classes in places of your own, such as a Twig function from a custom extension, pass
them in `selectors`:

```js
twigTailwind.createConfig({
  drupal: true,
  selectors: [{ kind: 'callee', name: '^pattern_classes$', match: [{ type: 'strings' }] }],
}),
```

Use the `selectors` option rather than a `selectors` setting of your own: ESLint replaces arrays
in `settings` instead of merging them, so the setting would drop every built-in selector.
`twigSelectors` and `drupalSelectors` are exported as plain better-tailwindcss selector objects for
anyone who still wants to build the whole list by hand.

## Rules

| Rule | Description | Recommended |
|---|---|---|
| [`no-twig-interpolation`](docs/rules/no-twig-interpolation.md) | Disallow Twig interpolation in attributes and strings | error |

## Interpolated strings

better-tailwindcss finds interpolation by looking for JavaScript's `${` in the source text. Twig
writes `#{`, so inside a string such as `"flex #{modifier} p-4"` it would report `#{` as an
unknown class, and its class-order fix would move the interpolation around.

The `twig-tailwind/twig` processor prevents this: it drops every better-tailwindcss message, and
with it every fix, that starts inside a Twig string containing `#{ }`. Other strings in the file
are linted and fixed as usual, and messages from other plugins are kept. The classes inside an
interpolated string are therefore not checked; use an array such as `['flex', modifier]` instead
to keep them visible. [`no-twig-interpolation`](docs/rules/no-twig-interpolation.md) reports these strings. An ESLint config applies one processor per file, so
if you set your own processor for `.twig` files, these strings are no longer silenced.

## CUBE CSS separators

[CUBE CSS](https://cube.fyi) lets a class list be grouped with `[ ]` and `|` separators, as in
`'o-section | flex flex-col [ md:flex-row md:gap-8 ] [ lg:gap-12 ]'`. better-tailwindcss reads
`[`, `]` and `|` as classes, so its fixes would sort them away from their group, remove the second
`[` as a duplicate, or wrap a bracket away from its classes.

The `twig-tailwind/twig` processor prevents this: it drops every better-tailwindcss report about a
delimiter itself, and every report whose fix would rewrite a class list that contains one. Fixes
to a single class in such a list, such as a deprecated or canonical class name, still apply, and
lists without delimiters are sorted and wrapped as usual. The order and wrapping of grouped lists
are not checked.

## Known limitations

- **Classes built by concatenation** (`'c-grid--' ~ count ~ '-items'`) are only partly visible:
  the fixed fragments are separate strings, and the recommended config reports them with
  `better-tailwindcss/no-concatenated-classes`.
- **Classes computed in PHP** (preprocess functions) are not in the template and cannot be seen.
- **Twig blocks the parser could not read** are left out of the tree, so the classes inside them are
  skipped. [`twig-html/no-parse-errors`](../eslint-plugin-twig-html/docs/rules/no-parse-errors.md)
  reports them.
- **Oxlint** cannot run these rules on Twig: it does not support custom HTML parsers yet.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).
