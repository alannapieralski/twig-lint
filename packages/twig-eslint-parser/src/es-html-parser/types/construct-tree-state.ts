import { ConstructTreeContextTypes } from "../constants/index.js";
import { DocumentNode } from "./node.js";
import { AnyContextualNode } from "./contextual-node.js";

export type ConstructTreeState<N extends AnyContextualNode> = {
  caretPosition: number;
  currentContext: {
    type: ConstructTreeContextTypes;
    parentRef?: any;
    content?: any[];
  };
  currentNode: N;
  rootNode: DocumentNode;
  voidElements: ReadonlySet<string>;
};
