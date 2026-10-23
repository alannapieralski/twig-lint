# twig-tailwind/no-twig-interpolation

Disallow Twig interpolation in attributes and strings.

Enabled as an error by `createConfig()`.

## Rule details

`class="flex {{ modifier }}"` hides classes from every linter: nothing can know what the Twig
produces. This rule reports Twig (`{{ }}`, `{% %}` or `{# #}`) inside `class=""` and points to the
alternatives, `{% set classes = [...] %}` with `attributes.addClass()`, or `{ classes: [...] }`
passed to an include.

The same goes for a Twig string that interpolates with `#{ }`. better-tailwindcss does not understand
`#{`, so the `twig-tailwind/twig` processor silences it and the classes in the string are never
checked. The rule reports every such string, and every string is checked, not only class lists.

Examples of **incorrect** code:

```twig
<div class="card {{ modifier }}">
<p class="flex {% if active %}font-bold{% endif %}">
{% set classes = "flex #{modifier} p-4" %}
```

Examples of **correct** code:

```twig
{% set classes = ['card', is_featured ? 'card--featured'] %}
{% set classes = ['flex', modifier, 'p-4'] %}
<div{{ attributes.addClass(classes) }}>

{% include 'numiko:card' with { classes: ['w-full', modifier] } only %}
```

The rule also reports attributes that the parser's `ignoreInterpolatedAttributes` option leaves out
of the HTML AST (it reads them from the parser services). With the recommended config,
better-tailwindcss stays quiet about `{{` and BEM fragments, and each such attribute is reported
once by this rule.

## Options

| Option | Default | Description |
|---|---|---|
| `attributes` | `['class']` | Attribute names (case-insensitive) to check. Strings with `#{ }` are always checked. |

```js
'twig-tailwind/no-twig-interpolation': ['error', { attributes: ['class', 'style'] }],
```

## Testing

- `test/integration/recommended.test.ts` lints templates with the recommended config and checks the reports, the `attributes` option and turning the rule off.
- `tools/corpus/canaries/twig-tailwind.html.twig` is a canary the rule must report on every corpus run.
