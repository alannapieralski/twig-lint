import { TokenizerContextTypes, TokenTypes } from "../../constants/index.js";
import { calculateTokenPosition, isWhitespace, reportEndOfInputInTag } from "../../utils/index.js";
import { AnyToken, TemplateKind, TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

export function parse(chars: CharsBuffer, state: TokenizerState) {
  const value = chars.value();
  if (isWhitespace(value)) {
    return parseWhitespace(state);
  }

  if (value === ">") {
    return parseClosingCornerBrace(state);
  }

  state.decisionBuffer.clear();
  state.sourceCode.next();
}

export function parseTemplate(_kind: TemplateKind, state: TokenizerState) {
  parse(state.decisionBuffer, state);
}

function generateDoctypeOpenToken(state: TokenizerState): AnyToken {
  const position = calculateTokenPosition(state, { keepBuffer: false });

  return {
    type: TokenTypes.DoctypeOpen,
    value: state.accumulatedContent.value(),
    range: position.range,
    loc: position.loc,
  };
}

function parseWhitespace(state: TokenizerState) {
  state.tokens.push(generateDoctypeOpenToken(state));

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.DoctypeAttributes;
}

function parseClosingCornerBrace(state: TokenizerState) {
  state.tokens.push(generateDoctypeOpenToken(state));

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.DoctypeClose;
}

export function handleContentEnd(state: TokenizerState) {
  reportEndOfInputInTag(state);
}
