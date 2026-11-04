import { TokenizerContextTypes, TokenTypes } from "../../constants/index.js";
import { calculateTokenPosition, createParts, moveIntoContentExceptLast, pushContentAtEndOfInput } from "../../utils/index.js";
import type { AnyToken, Range, TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

const END_TAG_NAME_END = /[\t\n\f\r />]/;

function endTagOf(state: TokenizerState): string {
  return `</${state.contextParams[TokenizerContextTypes.RawText]?.tagName ?? ""}`;
}

export function parse(chars: CharsBuffer, state: TokenizerState) {
  const value = chars.value();
  const endTag = endTagOf(state);
  if (endTag.startsWith(value.toLowerCase())) {
    state.sourceCode.next();
    return;
  }

  const isEndTag = value.length === endTag.length + 1 && value.slice(0, -1).toLowerCase() === endTag && END_TAG_NAME_END.test(value.slice(-1));
  if (isEndTag) {
    return parseEndTag(state);
  }

  if (value.length > 1 && value.endsWith("<")) {
    return keepLastOpeningCornerBrace(state);
  }

  state.accumulatedContent.concatBuffer(state.decisionBuffer);
  state.decisionBuffer.clear();
  state.sourceCode.next();
}

function keepLastOpeningCornerBrace(state: TokenizerState) {
  moveIntoContentExceptLast(state, 1);
  state.sourceCode.next();
}

function pushContent(state: TokenizerState) {
  const params = state.contextParams[TokenizerContextTypes.RawText];
  if (!params || state.accumulatedContent.length() === 0) {
    return;
  }
  const position = calculateTokenPosition(state, { keepBuffer: false });
  state.tokens.push({
    type: params.contentType,
    value: state.accumulatedContent.value(),
    range: position.range,
    loc: position.loc,
    parts: createParts(state, params.contentType),
  } as AnyToken);
}

function parseEndTag(state: TokenizerState) {
  const params = state.contextParams[TokenizerContextTypes.RawText];
  pushContent(state);
  state.contextParams[TokenizerContextTypes.RawText] = undefined;

  if (state.decisionBuffer.value().endsWith(">")) {
    const range: Range = [state.sourceCode.index() - (state.decisionBuffer.length() - 1), state.sourceCode.index() + 1];
    state.tokens.push({
      type: params?.closeType ?? TokenTypes.CloseTag,
      name: params?.tagName ?? "",
      value: state.decisionBuffer.value(),
      range,
      loc: state.sourceCode.getLocationOf(range),
    } as AnyToken);
    state.accumulatedContent.clear();
    state.decisionBuffer.clear();
    state.currentContext = TokenizerContextTypes.Data;
    state.sourceCode.next();
    return;
  }

  state.accumulatedContent.replace(state.decisionBuffer);
  state.decisionBuffer.clear();
  state.contextParams[TokenizerContextTypes.CloseTag] = { closeType: params?.closeType ?? TokenTypes.CloseTag };
  state.currentContext = TokenizerContextTypes.CloseTag;
  state.sourceCode.next();
}

export function handleContentEnd(state: TokenizerState) {
  const params = state.contextParams[TokenizerContextTypes.RawText];
  if (params) {
    pushContentAtEndOfInput(state, params.contentType);
  }
}
