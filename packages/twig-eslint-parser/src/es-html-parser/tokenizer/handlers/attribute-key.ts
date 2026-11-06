import { TokenizerContextTypes } from "../../constants/index.js";
import { TokenTypes } from "../../constants/token-types.js";
import {
  calculateTokenPosition,
  createParts,
  isCharacterThatBreaksAnAttribute,
  isWhitespace,
  pushContentAtEndOfInput,
  readTemplateAsContent,
  reportCharacterInOpenTag,
  reportError,
  reportEndOfInputInTag,
} from "../../utils/index.js";
import type { Range, TemplateKind, TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

export function parse(chars: CharsBuffer, state: TokenizerState) {
  if (isKeyBreak(chars)) {
    return parseKeyEnd(state);
  }

  if (isCharacterThatBreaksAnAttribute(chars.value())) {
    reportCharacterInOpenTag(state, "unexpected-character-in-attribute-name", state.sourceCode.index());
  }

  state.accumulatedContent.concatBuffer(state.decisionBuffer);
  state.decisionBuffer.clear();
  state.sourceCode.next();
}

export function parseTemplate(kind: TemplateKind, state: TokenizerState) {
  if (kind === "print") {
    return readTemplateAsContent(kind, state);
  }
  parseKeyEnd(state);
}

function isKeyBreak(chars: CharsBuffer): boolean {
  const value = chars.value();
  return value === "=" || value === "/" || value === ">" || isWhitespace(value);
}

function checkForRepeatedName(state: TokenizerState, name: string, range: Range) {
  const nameRanges = state.contextParams[TokenizerContextTypes.Attributes]?.attributeNameRanges;
  const firstRange = nameRanges?.get(name);
  if (firstRange) {
    reportError(state, { code: "duplicate-attribute", tagStart: state.tagStart ?? 0, range, firstRange });
    return;
  }
  nameRanges?.set(name, range);
}

function parseKeyEnd(state: TokenizerState) {
  const position = calculateTokenPosition(state, { keepBuffer: false });
  if (!state.accumulatedContent.hasTemplate()) {
    checkForRepeatedName(state, state.accumulatedContent.value().toLowerCase(), position.range);
  }

  state.tokens.push({
    type: TokenTypes.AttributeKey,
    value: state.accumulatedContent.value(),
    range: position.range,
    loc: position.loc,
    parts: createParts(state, TokenTypes.AttributeKey),
  });

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.Attributes;
}

export function handleContentEnd(state: TokenizerState) {
  reportEndOfInputInTag(state);
  pushContentAtEndOfInput(state, TokenTypes.AttributeKey);
}
