import { ConstructTreeContextTypes, NodeTypes } from "../constants/index.js";
import { AnyContextualNode, ConstructTreeState, DocumentNode, Range, AnyToken } from "../types/index.js";
import { SourceLocation } from "../types/source-location.js";
import { extendNodeEndToLastChild, first, last } from "../utils/index.js";
import { cloneLocation } from "../utils/clone-location.js";
import {
  tagContent,
  tag,
  tagName,
  attributes,
  attribute,
  attributeValue,
  comment,
  doctype,
  doctypeAttributes,
  doctypeAttribute,
  scriptTag,
  styleTag,
} from "./handlers/index.js";

const contextHandlers = {
  [ConstructTreeContextTypes.TagContent]: tagContent,
  [ConstructTreeContextTypes.Tag]: tag,
  [ConstructTreeContextTypes.TagName]: tagName,
  [ConstructTreeContextTypes.Attribute]: attribute,
  [ConstructTreeContextTypes.Attributes]: attributes,
  [ConstructTreeContextTypes.AttributeValue]: attributeValue,
  [ConstructTreeContextTypes.Comment]: comment,
  [ConstructTreeContextTypes.Doctype]: doctype,
  [ConstructTreeContextTypes.DoctypeAttributes]: doctypeAttributes,
  [ConstructTreeContextTypes.DoctypeAttribute]: doctypeAttribute,
  [ConstructTreeContextTypes.ScriptTag]: scriptTag,
  [ConstructTreeContextTypes.StyleTag]: styleTag,
};

const EMPTY_RANGE: Range = [0, 0];
const EMPTY_LOC: SourceLocation = {
  start: {
    line: 1,
    column: 0,
  },
  end: {
    line: 1,
    column: 0,
  },
};

const VOID_ELEMENTS = [
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
];

export function constructTree(tokens: AnyToken[], extraVoidElements: readonly string[] = []) {
  const rootContext = {
    type: ConstructTreeContextTypes.TagContent,
    parentRef: undefined,
    content: [],
  };
  const lastToken = last(tokens);
  const firstToken = first(tokens);
  const range: Range = lastToken ? [0, lastToken.range[1]] : EMPTY_RANGE;
  const loc = lastToken
    ? {
        start: cloneLocation(firstToken.loc).start,
        end: cloneLocation(lastToken.loc).end,
      }
    : EMPTY_LOC;

  loc.start.line = 1;

  const rootNode: DocumentNode = {
    type: NodeTypes.Document,
    range,
    children: [],
    loc,
  };

  const state = {
    caretPosition: 0,
    currentContext: rootContext,
    currentNode: rootNode,
    rootNode,
    voidElements: new Set([...VOID_ELEMENTS, ...extraVoidElements.map((name) => name.toLowerCase())]),
  };

  const positionOffset = state!.caretPosition;
  processTokens(tokens, state!, positionOffset);
  endElementsLeftOpen(state!.currentNode);

  return { state, ast: state!.rootNode };
}

function endElementsLeftOpen(node: AnyContextualNode | undefined) {
  for (let open = node; open && open.type !== NodeTypes.Document; open = open.parentRef) {
    extendNodeEndToLastChild(open);
  }
}

function processTokens(
  tokens: AnyToken[],
  state: ConstructTreeState<any>,
  positionOffset: number
) {
  let tokenIndex = state.caretPosition - positionOffset;
  while (tokenIndex < tokens.length) {
    const token = tokens[tokenIndex];
    const handler = contextHandlers[state.currentContext.type].construct;
    // @ts-ignore
    state = handler(token, state);
    tokenIndex = state.caretPosition - positionOffset;
  }

  return state;
}
