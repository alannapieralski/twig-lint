import { TokenTypes } from "../constants/index.js";
import { Chars, CharsType } from "../tokenizer/chars.js";
import { AnyToken, TokenizerState } from "../types/index.js";
import { calculateTokenPosition } from "./calculate-token-position.js";
import { createParts } from "./templates.js";

/**
 * Moves the pending HTML text in the decision buffer into the content, except its last characters.
 *
 * @param state - The tokenizer state, whose decision buffer holds one run of HTML text.
 * @param keptLength - How many characters stay in the decision buffer.
 */
export function moveIntoContentExceptLast(state: TokenizerState, keptLength: number): void {
  const pending = state.decisionBuffer.first();
  if (!pending || pending.isTemplate || pending.value.length <= keptLength) {
    return;
  }
  const [start, end] = pending.range;
  const splitAt = end - keptLength;
  state.accumulatedContent.concat(new Chars(CharsType.HTML, pending.value.slice(0, -keptLength), [start, splitAt]));
  state.decisionBuffer.clear();
  state.decisionBuffer.concat(new Chars(CharsType.HTML, pending.value.slice(-keptLength), [splitAt, end]));
}

export type EndOfInputTokenType =
  | TokenTypes.Text
  | TokenTypes.CommentContent
  | TokenTypes.ScriptTagContent
  | TokenTypes.StyleTagContent
  | TokenTypes.RawContent
  | TokenTypes.AttributeKey
  | TokenTypes.AttributeValue;

/**
 * Emits everything read since the last token as one content token, as the HTML tokenizer does at the end of the input.
 *
 * @param state - The tokenizer state at the end of the input.
 * @param type - The type of content the current state reads.
 */
export function pushContentAtEndOfInput(state: TokenizerState, type: EndOfInputTokenType): void {
  state.accumulatedContent.concatBuffer(state.decisionBuffer);
  state.decisionBuffer.clear();
  if (state.accumulatedContent.length() === 0) {
    return;
  }
  const position = calculateTokenPosition(state, { keepBuffer: false });
  state.tokens.push({
    type,
    value: state.accumulatedContent.value(),
    range: position.range,
    loc: position.loc,
    parts: createParts(state, type),
  } as AnyToken);
  state.accumulatedContent.clear();
}
