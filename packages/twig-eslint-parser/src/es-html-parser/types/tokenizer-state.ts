import { TokenizerContextTypes, TokenTypes } from "../constants/index.js";
import { CharsBuffer } from "../tokenizer/chars-buffer.js";
import { SourceCode } from "../tokenizer/source-code.js";
import { TemplateInfo } from "./template.js";
import { ParseError } from "./parse-error.js";
import { Range } from "./range.js";
import { AnyToken } from "./token.js";
import { TokenAdapter } from "./token-adapter.js";

type ContextParams = {
  [TokenizerContextTypes.AttributeValueWrapped]?: {
    wrapper: string;
  };
  [TokenizerContextTypes.Attributes]?: {
    tagName: string;
    attributeNameRanges: Map<string, Range>;
  };
  [TokenizerContextTypes.OpenTagEnd]?: {
    tagName: string;
  };
  [TokenizerContextTypes.DoctypeAttributeWrapped]?: {
    wrapper: string;
  };
  [TokenizerContextTypes.RawText]?: {
    tagName: string;
    contentType: TokenTypes.ScriptTagContent | TokenTypes.StyleTagContent | TokenTypes.RawContent;
    closeType: TokenTypes.CloseScriptTag | TokenTypes.CloseStyleTag | TokenTypes.CloseTag;
  };
  [TokenizerContextTypes.AttributeValueBare]?: {
    isAfterTwigTag: boolean;
  };
  [TokenizerContextTypes.CommentContent]?: {
    openRange: Range;
  };
  [TokenizerContextTypes.CloseTag]?: {
    closeType: TokenTypes.CloseScriptTag | TokenTypes.CloseStyleTag | TokenTypes.CloseTag;
  };
};

export type TokenizerState = {
  mode: "template" | "default";
  currentContext: TokenizerContextTypes;
  contextParams: ContextParams;
  decisionBuffer: CharsBuffer;
  accumulatedContent: CharsBuffer;
  templateInfos: TemplateInfo[];
  rawContentTags?: string[];
  tokenAdapter: TokenAdapter;
  sourceCode: SourceCode;
  tagStart?: number;
  errors: ParseError[];
  tokens: {
    push(token: AnyToken): void;
  };
};
