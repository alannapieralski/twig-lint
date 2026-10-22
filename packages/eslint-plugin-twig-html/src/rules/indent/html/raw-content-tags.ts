export function readRawContentTags(parserOptions: unknown): readonly string[] {
  const rawContentTags = (parserOptions as { rawContentTags?: unknown } | undefined)?.rawContentTags;
  if (!Array.isArray(rawContentTags)) return [];
  return rawContentTags.filter((name): name is string => typeof name === 'string');
}
