import { ScriptTagNode, StyleTagNode, TagNode } from "./node.js";
import { Range } from "./range.js";

export type ParseError =
  | { code: "eof-in-comment"; range: Range }
  | { code: "eof-in-tag"; tagStart: number; range: Range }
  | { code: OpenTagCharacterErrorCode; tagStart: number; range: Range }
  | { code: "duplicate-attribute"; tagStart: number; range: Range; firstRange: Range }
  | { code: "x-invalid-end-tag"; range: Range; name: string; openElement?: TagNode; selfClosedElement?: TagNode }
  | { code: "x-unclosed-element"; range: Range; element: TagNode | ScriptTagNode | StyleTagNode };

export type OpenTagCharacterErrorCode =
  | "unexpected-character-in-attribute-name"
  | "unexpected-character-in-unquoted-attribute-value"
  | "unexpected-solidus-in-tag";
