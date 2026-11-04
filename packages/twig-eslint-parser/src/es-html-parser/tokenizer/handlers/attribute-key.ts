import { TokenizerContextTypes } from "../../constants/index.js";
import { TokenTypes } from "../../constants/token-types.js";
import { calculateTokenPosition, isWhitespace, createParts, readTemplateAsContent, pushContentAtEndOfInput } from "../../utils/index.js";
import type { TemplateKind, TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

export function parse(chars: CharsBuffer, state: TokenizerState) {
  if (isKeyBreak(chars)) {
    return parseKeyEnd(state);
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

function parseKeyEnd(state: TokenizerState) {
  const position = calculateTokenPosition(state, { keepBuffer: false });

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
  pushContentAtEndOfInput(state, TokenTypes.AttributeKey);
}
