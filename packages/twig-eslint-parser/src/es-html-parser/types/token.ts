import { TokenTypes } from "../constants/index.js";
import { SourceLocation } from "./source-location.js";
import { Range } from "./range.js";

export interface BaseToken {
  value: string;
  range: Range;
  loc: SourceLocation;
}

export interface Token<T extends TokenTypes> extends BaseToken {
  type: T;
}

export interface PartToken<T extends TokenTypes>
  extends Token<TokenTypes.Part> {
  partOf: T;
}

export interface TemplateToken<T extends TokenTypes>
  extends Token<TokenTypes.Template> {
  partOf: T;
  open?: Token<TokenTypes.OpenTemplate>;
  close?: Token<TokenTypes.CloseTemplate>;
}

export interface NamedToken<T extends TokenTypes> extends Token<T> {
  name: string;
  parts?: (PartToken<T> | TemplateToken<T>)[];
}

export interface CompositeToken<T extends TokenTypes> extends Token<T> {
  parts: (PartToken<T> | TemplateToken<T>)[];
}

export type AnyToken =
  | CompositeToken<TokenTypes.Text>
  | CompositeToken<TokenTypes.RawContent>
  | NamedToken<TokenTypes.OpenTagStart>
  | Token<TokenTypes.OpenTagEnd>
  | NamedToken<TokenTypes.CloseTag>
  | CompositeToken<TokenTypes.AttributeKey>
  | Token<TokenTypes.AttributeAssignment>
  | Token<TokenTypes.AttributeValueWrapperStart>
  | CompositeToken<TokenTypes.AttributeValue>
  | Token<TokenTypes.AttributeValueWrapperEnd>
  | Token<TokenTypes.DoctypeOpen>
  | Token<TokenTypes.DoctypeAttributeValue>
  | Token<TokenTypes.DoctypeAttributeWrapperStart>
  | Token<TokenTypes.DoctypeAttributeWrapperEnd>
  | Token<TokenTypes.DoctypeClose>
  | Token<TokenTypes.CommentOpen>
  | CompositeToken<TokenTypes.CommentContent>
  | Token<TokenTypes.CommentClose>
  | Token<TokenTypes.OpenScriptTagStart>
  | Token<TokenTypes.OpenScriptTagEnd>
  | CompositeToken<TokenTypes.ScriptTagContent>
  | Token<TokenTypes.CloseScriptTag>
  | Token<TokenTypes.OpenStyleTagStart>
  | Token<TokenTypes.OpenStyleTagEnd>
  | CompositeToken<TokenTypes.StyleTagContent>
  | Token<TokenTypes.CloseStyleTag>;
