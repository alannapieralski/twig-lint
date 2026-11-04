import {
  ConstructTreeContextTypes,
  NodeTypes,
  TokenTypes,
} from "../../constants/index.js";
import {
  ConstructTreeState,
  AnyToken,
  ContextualTagNode,
  ContextualCommentNode,
  Token,
  ContextualDocumentNode,
  ContextualScriptTagNode,
  ContextualStyleTagNode,
  ContextualDoctypeNode,
  TextNode,
  CompositeToken,
  RawContentNode,
} from "../../types/index.js";
import {
  cloneRange,
  extendNodeEndToLastChild,
  pairingKeyOf,
  createNodeFrom,
  cloneLocation,
  initChildrenIfNone,
} from "../../utils/index.js";

function handleOpenTagStart(
  state: ConstructTreeState<ContextualTagNode>,
  token: AnyToken
) {
  initChildrenIfNone(state.currentNode);

  const tagNode: ContextualTagNode = {
    type: NodeTypes.Tag,
    parentRef: state.currentNode,
    range: cloneRange(token.range),
    loc: cloneLocation(token.loc),
    attributes: [],
    children: [],
  };

  state.currentNode.children.push(tagNode);

  state.currentNode = tagNode;
  state.currentContext = {
    parentRef: state.currentContext,
    type: ConstructTreeContextTypes.Tag,
  };

  return state;
}

function findOpenTagClosedBy(node: ContextualTagNode, closeTagKey: string): ContextualTagNode | undefined {
  for (let open: ContextualTagNode | undefined = node; open?.type === NodeTypes.Tag; open = open.parentRef as ContextualTagNode | undefined) {
    if (pairingKeyOf(open.name ?? "") === closeTagKey) {
      return open;
    }
  }
  return undefined;
}

function leaveElementUnclosed(state: ConstructTreeState<ContextualTagNode>) {
  extendNodeEndToLastChild(state.currentNode);
  state.currentNode = state.currentNode.parentRef as ContextualTagNode;
  state.currentContext = state.currentContext.parentRef.parentRef;
}

function handleCloseTag(
  state: ConstructTreeState<ContextualTagNode>,
  token: AnyToken
) {
  const closeTagName = token.type === TokenTypes.CloseTag ? token.name : "";
  const closedTag = findOpenTagClosedBy(state.currentNode, pairingKeyOf(closeTagName));

  if (!closedTag) {
    state.caretPosition++;

    return state;
  }

  while (state.currentNode !== closedTag) {
    leaveElementUnclosed(state);
  }

  state.currentContext = state.currentContext.parentRef;

  return state;
}

function handleCommentOpen(
  state: ConstructTreeState<ContextualTagNode>,
  token: AnyToken
) {
  initChildrenIfNone(state.currentNode);

  const commentNode: ContextualCommentNode = {
    type: NodeTypes.Comment,
    parentRef: state.currentNode,
    range: cloneRange(token.range),
    loc: cloneLocation(token.loc),
  };

  state.currentNode.children.push(commentNode);

  // @ts-ignore
  state.currentNode = commentNode;
  state.currentContext = {
    parentRef: state.currentContext,
    type: ConstructTreeContextTypes.Comment,
  };

  return state;
}

function handleDoctypeOpen(
  state: ConstructTreeState<ContextualTagNode | ContextualDocumentNode>,
  token: AnyToken
) {
  initChildrenIfNone(state.currentNode);

  const doctypeNode: ContextualDoctypeNode = {
    type: NodeTypes.Doctype,
    parentRef: state.currentNode,
    range: cloneRange(token.range),
    loc: cloneLocation(token.loc),
    attributes: [],
  };

  state.currentNode.children.push(doctypeNode);

  // @ts-ignore
  state.currentNode = doctypeNode;
  state.currentContext = {
    parentRef: state.currentContext,
    type: ConstructTreeContextTypes.Doctype,
  };

  return state;
}

function handleText(
  state: ConstructTreeState<ContextualTagNode | ContextualDocumentNode>,
  token: CompositeToken<TokenTypes.Text>
) {
  initChildrenIfNone(state.currentNode);
  const textNode = createNodeFrom(token) as TextNode;

  state.currentNode.children.push(textNode);
  state.caretPosition++;

  return state;
}

function handleRawContent(
  state: ConstructTreeState<ContextualTagNode | ContextualDocumentNode>,
  token: CompositeToken<TokenTypes.RawContent>
) {
  initChildrenIfNone(state.currentNode);
  const rawContentNode = createNodeFrom(token) as RawContentNode;

  state.currentNode.children.push(rawContentNode);
  state.caretPosition++;

  return state;
}

function handleOpenScriptTagStart(
  state: ConstructTreeState<ContextualTagNode | ContextualDocumentNode>,
  token: Token<TokenTypes.OpenScriptTagStart>
) {
  initChildrenIfNone(state.currentNode);
  const scriptNode: ContextualScriptTagNode = {
    type: NodeTypes.ScriptTag,
    parentRef: state.currentNode,
    range: cloneRange(token.range),
    loc: cloneLocation(token.loc),
    attributes: [],
  };
  state.currentNode.children.push(scriptNode);

  // @ts-ignore
  state.currentNode = scriptNode;
  state.currentContext = {
    type: ConstructTreeContextTypes.ScriptTag,
    parentRef: state.currentContext,
  };

  return state;
}

function handleOpenStyleTagStart(
  state: ConstructTreeState<ContextualTagNode | ContextualDocumentNode>,
  token: Token<TokenTypes.OpenStyleTagStart>
) {
  initChildrenIfNone(state.currentNode);

  const styleNode: ContextualStyleTagNode = {
    type: NodeTypes.StyleTag,
    parentRef: state.currentNode,
    range: cloneRange(token.range),
    loc: cloneLocation(token.loc),
    attributes: [],
  };

  state.currentNode.children.push(styleNode);

  // @ts-ignore
  state.currentNode = styleNode;

  state.currentContext = {
    type: ConstructTreeContextTypes.StyleTag,
    parentRef: state.currentContext,
  };

  return state;
}

export function construct(
  token: AnyToken,
  state: ConstructTreeState<ContextualTagNode>
) {
  if (token.type === TokenTypes.OpenScriptTagStart) {
    return handleOpenScriptTagStart(state, token);
  }

  if (token.type === TokenTypes.OpenStyleTagStart) {
    return handleOpenStyleTagStart(state, token);
  }

  if (token.type === TokenTypes.OpenTagStart) {
    return handleOpenTagStart(state, token);
  }

  if (token.type === TokenTypes.Text) {
    return handleText(state, token);
  }

  if (token.type === TokenTypes.RawContent) {
    return handleRawContent(state, token);
  }

  if (token.type === TokenTypes.CloseTag) {
    return handleCloseTag(state, token);
  }

  if (token.type === TokenTypes.CommentOpen) {
    return handleCommentOpen(state, token);
  }

  if (token.type === TokenTypes.DoctypeOpen) {
    return handleDoctypeOpen(state, token);
  }

  state.caretPosition++;

  return state;
}
