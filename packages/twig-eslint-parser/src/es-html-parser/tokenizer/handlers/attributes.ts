import { TokenizerContextTypes, TokenTypes } from "../../constants/index.js";
import { calculateTokenPosition, createParts, isWhitespace, raise } from "../../utils/index.js";
import type { TemplateKind, TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

export function parse(chars: CharsBuffer, state: TokenizerState) {
  const value = chars.value();
  if (value === ">" || value === "/") {
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

function parseTagEnd(state: TokenizerState) {
  const tagName =
    state.contextParams[TokenizerContextTypes.Attributes]?.tagName;

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  state.currentContext = TokenizerContextTypes.OpenTagEnd;
  state.contextParams[TokenizerContextTypes.OpenTagEnd] = { tagName: tagName! };
  state.contextParams[TokenizerContextTypes.Attributes] = undefined;
}

function parseNoneWhitespace(chars: CharsBuffer, state: TokenizerState) {
  if (chars.value() === "<") {
    raise(
      calculateTokenPosition(state, { keepBuffer: true }),
      "Unexpected end of tag. Expected '>' to close the opening tag."
    );
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
