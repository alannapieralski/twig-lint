import { tokenizeTwig } from './tokens.js';
import type { Range } from '../range.js';
import type { TwigToken } from './tokens.js';

export type TwigQuote = "'" | '"';

export type TwigStringSummary = {
  readonly quote: TwigQuote;
  readonly range: Range;
  readonly isInterpolated: boolean;
};

type OpenString = { readonly quote: TwigQuote; readonly start: number; isInterpolated: boolean };

function parseQuote(token: TwigToken): TwigQuote {
  if (token.value === "'" || token.value === '"') {
    return token.value;
  }
  throw new Error(`A Twig ${token.type} token at ${token.start} holds ${JSON.stringify(token.value)}, not a quote.`);
}

export function summariseTwigStrings(tokens: readonly TwigToken[]): TwigStringSummary[] {
  const strings: TwigStringSummary[] = [];
  const openStrings: OpenString[] = [];

  for (const token of tokens) {
    if (token.type === 'OPENING_QUOTE') {
      openStrings.push({ quote: parseQuote(token), start: token.start, isInterpolated: false });
    }
    const innermost = openStrings.at(-1);
    if (token.type === 'INTERPOLATION_START' && innermost) {
      innermost.isInterpolated = true;
    }
    if (token.type === 'CLOSING_QUOTE') {
      const closed = openStrings.pop();
      if (!closed) {
        throw new Error(`A Twig string closes at ${token.start} without having opened.`);
      }
      strings.push({ quote: closed.quote, range: [closed.start, token.end], isInterpolated: closed.isInterpolated });
    }
  }
  return strings;
}

export function findInterpolatedStrings(code: string): readonly Range[] {
  return summariseTwigStrings(tokenizeTwig(code)).filter((string) => string.isInterpolated).map((string) => string.range);
}
