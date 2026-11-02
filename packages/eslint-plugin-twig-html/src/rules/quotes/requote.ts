import type { TwigQuote } from 'twig-eslint-parser';

export function requote(body: string, from: TwigQuote, to: TwigQuote): string | undefined {
  let requoted = '';

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index] as string;

    if (character === '\\') {
      const escaped = body[index + 1] ?? '';
      requoted += escaped === from ? from : `\\${escaped}`;
      index += 1;
      continue;
    }

    if (character === to) {
      return undefined;
    }
    if (to === '"' && character === '#' && body[index + 1] === '{') {
      return undefined;
    }

    requoted += character;
  }

  return requoted;
}
