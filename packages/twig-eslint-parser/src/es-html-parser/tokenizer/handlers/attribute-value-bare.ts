import { TokenizerContextTypes, TokenTypes } from "../../constants/index.js";
import {
  calculateTokenPosition,
  createParts,
  isCharacterThatBreaksAnAttribute,
  isWhitespace,
  pushContentAtEndOfInput,
  readTemplateAsContent,
  reportCharacterInOpenTag,
  reportEndOfInputInTag,
} from "../../utils/index.js";
import type { TemplateKind, TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

export function parseValueEnd(state: TokenizerState) {
  const position = calculateTokenPosition(state, { keepBuffer: false });

  state.tokens.push({
    type: TokenTypes.AttributeValue,
    value: state.accumulatedContent.value(),
    range: position.range,
    loc: position.loc,
    parts: createParts(state, TokenTypes.AttributeValue),
  });

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.Attributes;
  state.contextParams[TokenizerContextTypes.AttributeValueBare] = undefined;
}

export function parseTemplate(kind: TemplateKind, state: TokenizerState) {
  if (kind === "tag") {
    state.contextParams[TokenizerContextTypes.AttributeValueBare] = { isAfterTwigTag: true };
  }
  readTemplateAsContent(kind, state);
}

export function parse(chars: CharsBuffer, state: TokenizerState) {
  if (isWhitespace(chars.value()) || chars.value() === ">") {
    return parseValueEnd(state);
  }

  const isAfterTwigTag = state.contextParams[TokenizerContextTypes.AttributeValueBare]?.isAfterTwigTag ?? false;
  if (!isAfterTwigTag && isCharacterThatBreaksAnAttribute(chars.value())) {
    reportCharacterInOpenTag(state, "unexpected-character-in-unquoted-attribute-value", state.sourceCode.index());
  }

  state.accumulatedContent.concatBuffer(state.decisionBuffer);
  state.decisionBuffer.clear();
  state.sourceCode.next();
}

export function handleContentEnd(state: TokenizerState) {
  reportEndOfInputInTag(state);
  pushContentAtEndOfInput(state, TokenTypes.AttributeValue);
}
