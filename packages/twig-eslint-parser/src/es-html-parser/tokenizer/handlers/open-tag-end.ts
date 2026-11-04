import { TokenizerContextTypes, TokenTypes } from "../../constants/index.js";
import { calculateTokenPosition } from "../../utils/index.js";
import type { TokenizerState } from "../../types/index.js";
import { CharsBuffer } from "../chars-buffer.js";

const OPEN_TAG_END_TYPES: ReadonlyMap<string, TokenTypes> = new Map([
  ["script", TokenTypes.OpenScriptTagEnd],
  ["style", TokenTypes.OpenStyleTagEnd],
]);

type RawTextTokenTypes = Omit<NonNullable<TokenizerState["contextParams"][TokenizerContextTypes.RawText]>, "tagName">;

const RAW_TEXT_TOKEN_TYPES: ReadonlyMap<string, RawTextTokenTypes> = new Map([
  ["script", { contentType: TokenTypes.ScriptTagContent, closeType: TokenTypes.CloseScriptTag }],
  ["style", { contentType: TokenTypes.StyleTagContent, closeType: TokenTypes.CloseStyleTag }],
]);

const CUSTOM_RAW_TEXT_TOKEN_TYPES: RawTextTokenTypes = { contentType: TokenTypes.RawContent, closeType: TokenTypes.CloseTag };

export function parse(chars: CharsBuffer, state: TokenizerState) {
  if (chars.value() === ">") {
    return parseClosingCornerBrace(state);
  }

  state.accumulatedContent.concatBuffer(state.decisionBuffer);
  state.decisionBuffer.clear();
  state.sourceCode.next();
}

function parseClosingCornerBrace(state: TokenizerState) {
  const position = calculateTokenPosition(state, { keepBuffer: true });
  const tagName = state.contextParams[TokenizerContextTypes.OpenTagEnd]?.tagName ?? "";

  state.tokens.push({
    type: (OPEN_TAG_END_TYPES.get(tagName) ?? TokenTypes.OpenTagEnd) as TokenTypes.OpenTagEnd,
    value: state.accumulatedContent.value() + state.decisionBuffer.value(),
    range: position.range,
    loc: position.loc,
  });

  state.accumulatedContent.clear();
  state.decisionBuffer.clear();
  const rawTextTokenTypes = state.rawContentTags?.includes(tagName) ? CUSTOM_RAW_TEXT_TOKEN_TYPES : RAW_TEXT_TOKEN_TYPES.get(tagName);
  if (rawTextTokenTypes) {
    state.contextParams[TokenizerContextTypes.RawText] = { tagName, ...rawTextTokenTypes };
    state.currentContext = TokenizerContextTypes.RawText;
  } else {
    state.currentContext = TokenizerContextTypes.Data;
  }

  state.sourceCode.next();

  state.contextParams[TokenizerContextTypes.OpenTagEnd] = undefined;
}
