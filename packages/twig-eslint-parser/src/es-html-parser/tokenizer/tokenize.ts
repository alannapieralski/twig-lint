import { TokenizerContextTypes } from "../constants/index.js";
import { AnyToken, TemplateInfo, TokenAdapter, TokenizerState } from "../types/index.js";
import {
  attributeKey,
  attributeValueBare,
  attributes,
  closeTag,
  commentContent,
  data,
  doctypeAttributeBare,
  doctypeAttributes,
  DoctypeClose,
  DoctypeOpen,
  openTagEnd,
  openTagStart,
  doctypeAttributeWrapped,
  attributeValue,
  attributeValueWrapped,
  rawText,
  noop,
} from "./handlers/index.js";
import { TokenizeHandler } from "../types/index.js";
import { SourceCode } from "./source-code.js";
import { CharsBuffer } from "./chars-buffer.js";
import { readTemplateAsContent, templateKindOf } from "../utils/index.js";

const contextHandlers: Record<TokenizerContextTypes, TokenizeHandler> = {
  [TokenizerContextTypes.Data]: data,
  [TokenizerContextTypes.OpenTagStart]: openTagStart,
  [TokenizerContextTypes.CloseTag]: closeTag,
  [TokenizerContextTypes.Attributes]: attributes,
  [TokenizerContextTypes.OpenTagEnd]: openTagEnd,
  [TokenizerContextTypes.AttributeKey]: attributeKey,
  [TokenizerContextTypes.AttributeValue]: attributeValue,
  [TokenizerContextTypes.AttributeValueBare]: attributeValueBare,
  [TokenizerContextTypes.AttributeValueWrapped]: attributeValueWrapped,
  [TokenizerContextTypes.RawText]: rawText,
  [TokenizerContextTypes.DoctypeOpen]: DoctypeOpen,
  [TokenizerContextTypes.DoctypeClose]: DoctypeClose,
  [TokenizerContextTypes.DoctypeAttributes]: doctypeAttributes,
  [TokenizerContextTypes.DoctypeAttributeWrapped]: doctypeAttributeWrapped,
  [TokenizerContextTypes.DoctypeAttributeBare]: doctypeAttributeBare,
  [TokenizerContextTypes.CommentContent]: commentContent,
  [TokenizerContextTypes.CommentOpen]: noop,
  [TokenizerContextTypes.CommentClose]: noop,
};

function tokenizeChars(state: TokenizerState) {
  while (!state.sourceCode.isEof()) {
    const handler = contextHandlers[state.currentContext];
    const current = state.sourceCode.current();
    state.decisionBuffer.concat(current);
    if (current.isTemplate) {
      (handler.parseTemplate ?? readTemplateAsContent)(templateKindOf(current), state);
    } else {
      handler.parse(state.decisionBuffer, state);
    }
  }

  const handler = contextHandlers[state.currentContext];
  state.sourceCode.prev();

  if (handler.handleContentEnd !== undefined) {
    handler.handleContentEnd(state);
  }
}

export type TokenizeOptions = {
  templateInfos?: TemplateInfo[];
  rawContentTags?: string[];
};

export function tokenize(
  source = "",
  tokenAdapter: TokenAdapter,
  options: TokenizeOptions = {
    templateInfos: undefined,
    rawContentTags: undefined,
  }
): { state: TokenizerState; tokens: AnyToken[] } {
  const tokens: AnyToken[] = [];
  const state: TokenizerState = {
    currentContext: TokenizerContextTypes.Data,
    contextParams: {},
    mode: options.templateInfos ? "template" : "default",
    templateInfos: options.templateInfos || [],
    decisionBuffer: new CharsBuffer(),
    accumulatedContent: new CharsBuffer(),
    tokenAdapter,
    rawContentTags: options.rawContentTags,
    sourceCode: new SourceCode(source, options.templateInfos || []),
    errors: [],
    tokens: {
      push(token: AnyToken) {
        tokens.push({
          ...token,
          range: tokenAdapter.finalizeRange(token),
          loc: tokenAdapter.finalizeLocation(token),
        });
      },
    },
  };

  tokenizeChars(state);

  return { state, tokens };
}
