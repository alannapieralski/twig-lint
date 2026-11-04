import { TokenizerContextTypes, TokenTypes } from "../../constants/index.js";
import { calculateTokenPosition, createParts, moveIntoContentExceptLast, pushContentAtEndOfInput } from "../../utils/index.js";
import type { Range, TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

const PENDING_COMMENT_END = /^(?:-+|--+!)$/;
const COMMENT_END = /^--+!?>$/;
const ABRUPT_EMPTY_COMMENT_END: ReadonlySet<string> = new Set([">", "->"]);

export function parse(chars: CharsBuffer, state: TokenizerState) {
  const value = chars.value();
  const isAtCommentStart = state.accumulatedContent.length() === 0;
  if (isAtCommentStart && ABRUPT_EMPTY_COMMENT_END.has(value)) {
    return parseCommentClose(state, value.length);
  }

  if (COMMENT_END.test(value)) {
    const closeLength = value.endsWith("!>") ? "--!>".length : "-->".length;
    moveIntoContentExceptLast(state, closeLength);
    return parseCommentClose(state, closeLength);
  }

  if (PENDING_COMMENT_END.test(value)) {
    state.sourceCode.next();
    return;
  }

  state.accumulatedContent.concatBuffer(state.decisionBuffer);
  state.decisionBuffer.clear();
  state.sourceCode.next();
}

function parseCommentClose(state: TokenizerState, closeLength: number) {
  const position = calculateTokenPosition(state, { keepBuffer: false });
  const endRange: Range = [position.range[1], position.range[1] + closeLength];

  state.tokens.push({
    type: TokenTypes.CommentContent,
    value: state.accumulatedContent.value(),
    range: position.range,
    loc: position.loc,
    parts: createParts(state, TokenTypes.CommentContent),
  });
  state.tokens.push({
    type: TokenTypes.CommentClose,
    value: state.decisionBuffer.value(),
    range: endRange,
    loc: state.sourceCode.getLocationOf(endRange),
  });

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.Data;
  state.sourceCode.next();
}

export function handleContentEnd(state: TokenizerState) {
  pushContentAtEndOfInput(state, TokenTypes.CommentContent);
}
