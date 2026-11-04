import { TokenizerContextTypes, TokenTypes } from "../../constants/index.js";
import { calculateTokenPosition, reportEndOfInputInTag } from "../../utils/index.js";
import type { TemplateKind, TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

export function parse(chars: CharsBuffer, state: TokenizerState) {
  const position = calculateTokenPosition(state, { keepBuffer: true });

  state.tokens.push({
    type: TokenTypes.DoctypeClose,
    value: state.decisionBuffer.value(),
    range: position.range,
    loc: position.loc,
  });

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.Data;
  state.sourceCode.next();
}

export function parseTemplate(_kind: TemplateKind, state: TokenizerState) {
  parse(state.decisionBuffer, state);
}

export function handleContentEnd(state: TokenizerState) {
  reportEndOfInputInTag(state);
}
