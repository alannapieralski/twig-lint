import { ConstructTreeContextTypes, TokenTypes } from "../../constants/index.js";
import {
  AnyToken,
  CloseTagNode,
  ConstructTreeState,
  ContextualTagNode,
  OpenTagEndNode,
  OpenTagStartNode,
  NamedToken,
  Token,
} from "../../types/index.js";
import { createNodeFrom, pairingKeyOf, updateNodeEnd } from "../../utils/index.js";

const ATTRIBUTE_START_TOKENS = [
  TokenTypes.AttributeKey,
  TokenTypes.AttributeAssignment,
];

function handleOpenTagStart(
  state: ConstructTreeState<ContextualTagNode>,
  token: NamedToken<TokenTypes.OpenTagStart>
) {
  state.currentNode.openStart = createNodeFrom(token) as OpenTagStartNode;
  state.currentContext = {
    parentRef: state.currentContext,
    type: ConstructTreeContextTypes.TagName,
  };

  return state;
}

function handleAttributeStart(state: ConstructTreeState<ContextualTagNode>) {
  state.currentContext = {
    parentRef: state.currentContext,
    type: ConstructTreeContextTypes.Attributes,
  };

  return state;
}

function handleOpenTagEnd(
  state: ConstructTreeState<ContextualTagNode>,
  token: Token<TokenTypes.OpenTagEnd>
) {
  const tagName = state.currentNode.name;

  state.currentNode.openEnd = createNodeFrom(token) as OpenTagEndNode;

  updateNodeEnd(state.currentNode, token);

  if (
    state.voidElements.has(tagName ?? "") ||
    state.currentNode.openEnd.value === "/>"
  ) {
    state.currentNode.selfClosing = true;
    if (state.currentNode.openEnd.value === "/>") {
      state.selfClosedElementsByName.set(pairingKeyOf(tagName ?? ""), state.currentNode);
    }
    state.currentNode = state.currentNode.parentRef;
    state.currentContext = state.currentContext.parentRef;
    state.caretPosition++;

    return state;
  }

  state.currentNode.selfClosing = false;
  state.currentContext = {
    parentRef: state.currentContext,
    type: ConstructTreeContextTypes.TagContent,
  };
  state.caretPosition++;

  return state;
}

function handleCloseTag(
  state: ConstructTreeState<ContextualTagNode>,
  token: NamedToken<TokenTypes.CloseTag>
) {
  state.currentNode.close = createNodeFrom(token) as CloseTagNode;
  updateNodeEnd(state.currentNode, token);

  state.currentNode = state.currentNode.parentRef;
  state.currentContext = state.currentContext.parentRef;
  state.caretPosition++;

  return state;
}

export function construct(
  token: AnyToken,
  state: ConstructTreeState<ContextualTagNode>
) {
  if (token.type === TokenTypes.OpenTagStart) {
    return handleOpenTagStart(state, token);
  }

  if (ATTRIBUTE_START_TOKENS.indexOf(token.type) !== -1) {
    return handleAttributeStart(state);
  }

  if (token.type === TokenTypes.OpenTagEnd) {
    return handleOpenTagEnd(state, token);
  }

  if (token.type === TokenTypes.CloseTag) {
    return handleCloseTag(state, token);
  }

  state.caretPosition++;

  return state;
}
