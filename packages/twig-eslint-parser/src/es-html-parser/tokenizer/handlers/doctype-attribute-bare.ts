import { TokenizerContextTypes, TokenTypes } from "../../constants/index.js";
import { calculateTokenPosition, isWhitespace } from "../../utils/index.js";
import type { TemplateKind, TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

export function parse(chars: CharsBuffer, state: TokenizerState) {
  if (isWhitespace(chars.value()) || chars.value() === ">") {
    return parseAttributeEnd(state);
  }

  state.accumulatedContent.concatBuffer(state.decisionBuffer);
  state.decisionBuffer.clear();
  state.sourceCode.next();
}

export function parseTemplate(_kind: TemplateKind, state: TokenizerState) {
  parse(state.decisionBuffer, state);
}

function parseAttributeEnd(state: TokenizerState) {
  const position = calculateTokenPosition(state, { keepBuffer: false });

  state.tokens.push({
    type: TokenTypes.DoctypeAttributeValue,
    value: state.accumulatedContent.value(),
    range: position.range,
    loc: position.loc,
  });

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.DoctypeAttributes;
}
