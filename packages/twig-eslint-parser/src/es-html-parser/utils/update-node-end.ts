import { AnyContextualNode, AnyNode, AnyToken } from "../types/index.js";

export function updateNodeEnd(
  node: AnyNode | AnyContextualNode,
  token: AnyToken
): void {
  node.range[1] = token.range[1];
  node.loc.end = { ...token.loc.end };
}

export function extendNodeEndToLastChild(node: AnyNode | AnyContextualNode): void {
  const children = "children" in node ? node.children : undefined;
  const lastChild = children?.[children.length - 1];
  if (!lastChild || lastChild.range[1] <= node.range[1]) {
    return;
  }
  node.range[1] = lastChild.range[1];
  node.loc.end = { ...lastChild.loc.end };
}
