import { containsTwig, depthChangeWithin, type AttributeNode } from 'twig-eslint-parser';
import type { Problem } from '../../shared/problem.js';
import { htmlTextOf, printsTwigOutput } from './attribute-value.js';
import { describeQuote } from './quote-style.js';
import type { AttributeValue, AttributeWrapper, QuoteSource } from './types.js';

const characterThatNeedsQuotes = /["'=<>`]/;
const endOfUnquotedValue = /^(\s|>|$)/;

function findWrappedProblems(attribute: AttributeNode, startWrapper: AttributeWrapper, endWrapper: AttributeWrapper, isFixable: boolean, source: QuoteSource): Problem[] {
  const { htmlQuote } = source;
  if (startWrapper.value !== endWrapper.value || startWrapper.value === htmlQuote) return [];
  if (htmlTextOf(attribute.value).includes(htmlQuote)) return [];

  const isSafeToSwap = isFixable && !printsTwigOutput(attribute.value);

  return [{
    range: attribute.range,
    messageId: 'wrongHtmlQuote',
    data: { expected: describeQuote(htmlQuote) },
    ...(isSafeToSwap && {
      edits: [
        { range: startWrapper.range, text: htmlQuote },
        { range: endWrapper.range, text: htmlQuote },
      ],
    }),
  }];
}

function isSafeToWrap(attribute: AttributeNode, value: AttributeValue, isFixable: boolean, text: string): boolean {
  if (!isFixable || containsTwig(attribute)) return false;
  if (characterThatNeedsQuotes.test(htmlTextOf(value))) return false;

  return endOfUnquotedValue.test(text.charAt(value.range[1]));
}

function findUnquotedProblems(attribute: AttributeNode, value: AttributeValue, isFixable: boolean, source: QuoteSource): Problem[] {
  const { htmlQuote, text } = source;
  const [valueStart, valueEnd] = value.range;

  return [{
    range: attribute.range,
    messageId: 'missingHtmlQuote',
    data: { expected: describeQuote(htmlQuote) },
    ...(isSafeToWrap(attribute, value, isFixable, text) && {
      edits: [
        { range: [valueStart, valueStart], text: htmlQuote },
        { range: [valueEnd, valueEnd], text: htmlQuote },
      ],
    }),
  }];
}

export function findAttributeProblems(attribute: AttributeNode, isInSoundTag: boolean, source: QuoteSource): Problem[] {
  const { value, startWrapper, endWrapper } = attribute;
  const isFixable = isInSoundTag && (value === undefined || depthChangeWithin(value.range, source.blocks) === 0);

  if (startWrapper && endWrapper) return findWrappedProblems(attribute, startWrapper, endWrapper, isFixable, source);
  if (startWrapper || endWrapper || !value || value.value === '') return [];

  return findUnquotedProblems(attribute, value, isFixable, source);
}
