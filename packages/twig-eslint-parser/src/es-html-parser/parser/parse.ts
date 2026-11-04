import { constructTree } from "../tree-constructor/index.js";
import { tokenize } from "../tokenizer/index.js";
import { ParseResult } from "../types/index.js";
import { clearParent } from "../utils/index.js";
import { defaultTokenAdapter } from "../token-adapter/index.js";
import { Options } from "../types/parse.js";

export function parse(html: string, options?: Options): ParseResult {
  const tokenAdapter = (options && options.tokenAdapter) || defaultTokenAdapter;
  const { state: tokenizerState, tokens } = tokenize(html, tokenAdapter, options);
  const { state: treeState, ast } = constructTree(tokens, options?.voidElements);
  return {
    ast: clearParent(ast),
    tokens,
    errors: [...tokenizerState.errors, ...treeState.errors],
  };
}
