import type { AttributeNode, TwigBlockSummary, TwigQuote } from 'twig-eslint-parser';
import type { ParsedTag } from '../../shared/tag-node.js';

export type AttributeWrapper = NonNullable<AttributeNode['startWrapper']>;

export type AttributeValue = NonNullable<AttributeNode['value']>;

export type TagWithAttributes = Omit<ParsedTag, 'attributes'> & { readonly attributes: readonly AttributeNode[] };

export type QuoteSource = {
  readonly text: string;
  readonly blocks: readonly TwigBlockSummary[];
  readonly unsoundTagStarts: ReadonlySet<number>;
  readonly htmlQuote: TwigQuote;
  readonly twigQuote: TwigQuote;
};
