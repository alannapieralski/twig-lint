import { TokenizerContextTypes, TokenTypes } from "../../constants/index.js";
import {
  calculateTokenPosition,
  createParts,
  isCharacterThatBreaksAnAttribute,
  isWhitespace,
  moveIntoContentExceptLast,
  reportCharacterInOpenTag,
  reportEndOfInputInTag,
} from "../../utils/index.js";
import type { TemplateKind, TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

export function parse(chars: CharsBuffer, state: TokenizerState) {
  const value = chars.value();
  if (value === "/") {
    state.sourceCode.next();
    return;
  }

  if (value === "/>") {
    moveIntoContentExceptLast(state, 1);
    return parseTagEnd(state);
  }

  if (value.startsWith("/")) {
    return ignoreStraySolidus(state);
  }

  if (value === ">") {
    return parseTagEnd(state);
  }

  if (value === "=") {
    return parseEqual(state);
  }

  if (!isWhitespace(value)) {
    return parseNoneWhitespace(chars, state);
  }

  state.decisionBuffer.clear();
  state.sourceCode.next();
}

export function parseTemplate(kind: TemplateKind, state: TokenizerState) {
  if (state.decisionBuffer.value().startsWith("/")) {
    reportCharacterInOpenTag(state, "unexpected-solidus-in-tag", startOfDecisionBuffer(state));
    state.decisionBuffer.removeFirst();
  }
  if (kind === "comment") {
    state.decisionBuffer.clear();
    state.sourceCode.next();
    return;
  }
  if (kind === "tag") {
    return parseStandaloneTemplate(state);
  }
  parseNoneWhitespace(state.decisionBuffer, state);
}

function parseStandaloneTemplate(state: TokenizerState) {
  state.accumulatedContent.replace(state.decisionBuffer);
  state.decisionBuffer.clear();
  const position = calculateTokenPosition(state, { keepBuffer: false });

  state.tokens.push({
    type: TokenTypes.AttributeKey,
    value: state.accumulatedContent.value(),
    range: position.range,
    loc: position.loc,
    parts: createParts(state, TokenTypes.AttributeKey),
  });

  state.accumulatedContent.clear();
  state.sourceCode.next();
}

function startOfDecisionBuffer(state: TokenizerState): number {
  return state.sourceCode.index() - (state.decisionBuffer.length() - 1);
}

function ignoreStraySolidus(state: TokenizerState) {
  reportCharacterInOpenTag(state, "unexpected-solidus-in-tag", startOfDecisionBuffer(state));
  state.decisionBuffer.clear();
}

function parseTagEnd(state: TokenizerState) {
  const tagName =
    state.contextParams[TokenizerContextTypes.Attributes]?.tagName;

  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.OpenTagEnd;
  state.contextParams[TokenizerContextTypes.OpenTagEnd] = { tagName: tagName! };
  state.contextParams[TokenizerContextTypes.Attributes] = undefined;
}

function parseNoneWhitespace(chars: CharsBuffer, state: TokenizerState) {
  if (isCharacterThatBreaksAnAttribute(chars.value())) {
    reportCharacterInOpenTag(state, "unexpected-character-in-attribute-name", startOfDecisionBuffer(state));
  }
  state.accumulatedContent.replace(state.decisionBuffer);
  state.currentContext = TokenizerContextTypes.AttributeKey;
  state.sourceCode.next();
  state.decisionBuffer.clear();
}

function parseEqual(state: TokenizerState) {
  const position = calculateTokenPosition(state, { keepBuffer: true });
  state.tokens.push({
    type: TokenTypes.AttributeAssignment,
    value: state.decisionBuffer.value(),
    range: position.range,
    loc: position.loc,
  });

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.AttributeValue;
  state.sourceCode.next();
}

export function handleContentEnd(state: TokenizerState) {
  reportEndOfInputInTag(state);
}
