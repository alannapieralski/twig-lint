export type TwigParserOptions = {
  readonly ignoreInterpolatedAttributes: ReadonlySet<string>;
  readonly rawContentTags: ReadonlySet<string>;
};

function parseNames(optionName: string, nameKind: string, value: unknown): ReadonlySet<string> {
  if (value === undefined) {
    return new Set();
  }
  if (!Array.isArray(value) || !value.every((name) => typeof name === 'string' && name !== '')) {
    throw new TypeError(`twig-eslint-parser: parserOptions.${optionName} must be an array of ${nameKind}, received ${JSON.stringify(value)}.`);
  }
  return new Set(value.map((name) => name.toLowerCase()));
}

export function parseTwigParserOptions(options: Record<string, unknown>): TwigParserOptions {
  return {
    ignoreInterpolatedAttributes: parseNames('ignoreInterpolatedAttributes', 'attribute names', options['ignoreInterpolatedAttributes']),
    rawContentTags: parseNames('rawContentTags', 'element names', options['rawContentTags']),
  };
}
