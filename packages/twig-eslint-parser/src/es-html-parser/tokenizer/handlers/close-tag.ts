import { TokenizerContextTypes, TokenTypes } from "../../constants/index.js";
import { calculateTokenPosition, readTagName } from "../../utils/index.js";
import type { AnyToken, TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

export function parse(chars: CharsBuffer, state: TokenizerState) {
  const value = chars.value();
  if (value === ">") {
    return parseClosingCornerBrace(state);
  }

  state.accumulatedContent.concatBuffer(state.decisionBuffer);
  state.decisionBuffer.clear();
  state.sourceCode.next();
}

function parseClosingCornerBrace(state: TokenizerState) {
  const position = calculateTokenPosition(state, { keepBuffer: true });

  state.tokens.push({
    type: state.contextParams[TokenizerContextTypes.CloseTag]?.closeType ?? TokenTypes.CloseTag,
    name: readTagName(state.accumulatedContent, "</"),
    value: state.accumulatedContent.value() + state.decisionBuffer.value(),
    range: position.range,
    loc: position.loc,
  } as AnyToken);
  state.contextParams[TokenizerContextTypes.CloseTag] = undefined;

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.Data;
  state.sourceCode.next();
}
