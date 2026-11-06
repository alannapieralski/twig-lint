import { NodeTypes } from "../constants/index.js";
import { AnyContextualNode, ConstructTreeState, ContextualScriptTagNode, ContextualStyleTagNode, ContextualTagNode, ParseError, Range } from "../types/index.js";
import { reportError } from "../utils/index.js";

type ContextualElementNode = ContextualTagNode | ContextualScriptTagNode | ContextualStyleTagNode;

const ELEMENT_NODE_TYPES: ReadonlySet<NodeTypes> = new Set([NodeTypes.Tag, NodeTypes.ScriptTag, NodeTypes.StyleTag]);

const END_TAG_OPTIONAL_ELEMENTS: ReadonlySet<string> = new Set([
  "body", "caption", "colgroup", "dd", "dt", "head", "html", "li", "optgroup", "option", "p", "rp", "rt", "tbody", "td", "tfoot", "th", "thead", "tr",
]);

function isElementNode(node: AnyContextualNode): node is ContextualElementNode {
  return ELEMENT_NODE_TYPES.has(node.type);
}

function isMissingItsEndTag(element: ContextualElementNode): boolean {
  const name = element.type === NodeTypes.Tag ? element.name : undefined;
  const isEndTagOptional = name !== undefined && END_TAG_OPTIONAL_ELEMENTS.has(name);
  return element.openEnd !== undefined && element.close === undefined && !isEndTagOptional;
}

type UnclosedElement = Extract<ParseError, { code: "x-unclosed-element" }>["element"];

export function reportUnclosedElement(state: ConstructTreeState<any>, node: AnyContextualNode): void {
  if (!isElementNode(node) || !isMissingItsEndTag(node) || !node.openStart || !node.openEnd) {
    return;
  }
  const range: Range = [node.openStart.range[0], node.openEnd.range[1]];
  reportError(state, { code: "x-unclosed-element", range, element: node as unknown as UnclosedElement });
}
