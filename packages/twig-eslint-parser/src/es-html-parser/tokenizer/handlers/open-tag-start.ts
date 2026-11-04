import { TokenizerContextTypes, TokenTypes } from "../../constants/index.js";
import {
  calculateTokenPosition,
  createParts,
  isWhitespace,
  readTemplateAsContent,
  readTagName,
  reportEndOfInputInTag,
} from "../../utils/index.js";
import type { TemplateKind, TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

const OPEN_TAG_START_TYPES: ReadonlyMap<string, TokenTypes> = new Map([
  ["script", TokenTypes.OpenScriptTagStart],
  ["style", TokenTypes.OpenStyleTagStart],
]);

export function parse(chars: CharsBuffer, state: TokenizerState) {
  if (chars.value() === ">") {
    return parseTagEnd(state);
  }

  if (chars.value() === "/") {
    return reconsumeInAttributes(state);
  }

  if (isWhitespace(chars.value())) {
    return parseWhitespace(state);
  }

  state.accumulatedContent.concatBuffer(state.decisionBuffer);
  state.decisionBuffer.clear();
  state.sourceCode.next();
}

export function parseTemplate(kind: TemplateKind, state: TokenizerState) {
  if (kind === "print") {
    return readTemplateAsContent(kind, state);
  }
  reconsumeInAttributes(state);
}

function pushOpenTagStart(state: TokenizerState): string {
  const tagName = readTagName(state.accumulatedContent, "<");
  const position = calculateTokenPosition(state, { keepBuffer: false });
  const parts = createParts(state, TokenTypes.OpenTagStart);

  state.tokens.push({
    type: (OPEN_TAG_START_TYPES.get(tagName) ?? TokenTypes.OpenTagStart) as TokenTypes.OpenTagStart,
    name: tagName,
    value: state.accumulatedContent.value(),
    range: position.range,
    loc: position.loc,
    ...(parts.length > 0 && { parts }),
  });
  return tagName;
}

function reconsumeInAttributes(state: TokenizerState) {
  const tagName = pushOpenTagStart(state);

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.Attributes;
  state.contextParams[TokenizerContextTypes.Attributes] = { tagName, attributeNameRanges: new Map() };
}

function parseWhitespace(state: TokenizerState) {
  const tagName = pushOpenTagStart(state);

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.Attributes;
  state.contextParams[TokenizerContextTypes.Attributes] = { tagName, attributeNameRanges: new Map() };
  state.sourceCode.next();
}

function parseTagEnd(state: TokenizerState) {
  const tagName = pushOpenTagStart(state);

  state.decisionBuffer.clear();
  state.accumulatedContent.clear();
  state.currentContext = TokenizerContextTypes.OpenTagEnd;
  state.contextParams[TokenizerContextTypes.OpenTagEnd] = { tagName };
}

export function handleContentEnd(state: TokenizerState) {
  reportEndOfInputInTag(state);
}
