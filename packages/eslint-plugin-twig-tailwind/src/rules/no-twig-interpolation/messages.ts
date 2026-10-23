export const messages = {
  twigInAttribute: 'Avoid Twig inside {{name}}="": linters cannot see what it produces. Build the value with {% set classes = [...] %} and attributes.addClass(), or pass it to an include as { classes: [...] }.',
  twigInString: 'Avoid #{ } inside a Twig string: linters cannot see what it produces, so the classes in it are not checked. Build the value with an array such as [\'flex\', modifier] instead.',
} as const;
