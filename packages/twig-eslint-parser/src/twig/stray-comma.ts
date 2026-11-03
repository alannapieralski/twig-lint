import { EXPRESSION_TAGS } from './syntax.js';
import { findTopLevelIndices } from './tokens.js';
import type { TwigBlock } from './blocks.js';

export const STRAY_COMMA_REASON = 'a comma is only valid between the items of an array, a hash or an argument list';

export function hasStrayComma(block: TwigBlock): boolean {
  const isSingleExpression = block.kind === 'print' || (block.tagName !== undefined && EXPRESSION_TAGS.has(block.tagName));
  if (!isSingleExpression) {
    return false;
  }

  const topLevelIndices = findTopLevelIndices(block.tokens);
  return block.tokens.some((token, index) => topLevelIndices.has(index) && token.type === 'PUNCTUATION' && token.value === ',');
}
