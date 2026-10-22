import { TokenizerContextTypes, TokenTypes } from "../../constants/index.js";
import {
  calculateTokenPosition,
  createParts,
  isWhitespace,
  openTagNameOf,
} from "../../utils/index.js";
import type { TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

const tokensMap = {
  script: TokenTypes.OpenScriptTagStart,
  style: TokenTypes.OpenStyleTagStart,
  default: TokenTypes.OpenTagStart,
} as const;

export function parse(chars: CharsBuffer, state: TokenizerState) {
  if (chars.value() === ">" || chars.value() === "/") {
    return parseTagEnd(state);
  }

  if (isWhitespace(chars.value())) {
    return parseWhitespace(state);
  }

  state.accumulatedContent.concatBuffer(state.decisionBuffer);
  state.decisionBuffer.clear();
  state.sourceCode.next();
}

function pushOpenTagStart(state: TokenizerState): string {
  const tagName = openTagNameOf(state.accumulatedContent);
  const position = calculateTokenPosition(state, { keepBuffer: false });
  const parts = createParts(state, TokenTypes.OpenTagStart);

  state.tokens.push({
    type: tokensMap[tagName as keyof typeof tokensMap] || tokensMap.default,
    value: state.accumulatedContent.value(),
    range: position.range,
    loc: position.loc,
    ...(parts.length > 0 && { parts }),
  });
  return tagName;
}

function parseWhitespace(state: TokenizerState) {
  const tagName = pushOpenTagStart(state);

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.Attributes;
  state.contextParams[TokenizerContextTypes.Attributes] = { tagName };
  state.sourceCode.next();
}

function parseTagEnd(state: TokenizerState) {
  const tagName = pushOpenTagStart(state);

  state.decisionBuffer.clear();
  state.accumulatedContent.clear();
  state.currentContext = TokenizerContextTypes.OpenTagEnd;
  state.contextParams[TokenizerContextTypes.OpenTagEnd] = { tagName };
}
