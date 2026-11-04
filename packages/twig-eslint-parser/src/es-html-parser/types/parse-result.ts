import { DocumentNode } from "./node.js";
import { AnyToken } from "./token.js";
import { ParseError } from "./parse-error.js";

export type ParseResult = {
  ast: DocumentNode;
  tokens: AnyToken[];
  errors: ParseError[];
};
