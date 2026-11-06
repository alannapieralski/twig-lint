import { TokenTypes } from "../../constants/index.js";
import {
  AnyToken,
  ConstructTreeState,
  NamedToken,
  ContextualTagNode,
} from "../../types/index.js";

function handleTagOpenStart(
  state: ConstructTreeState<ContextualTagNode>,
  token: NamedToken<TokenTypes.OpenTagStart>
) {
  state.currentNode.name = token.name;

  state.currentContext = state.currentContext.parentRef;

  return state;
}

export function construct(
  token: AnyToken,
  state: ConstructTreeState<ContextualTagNode>
) {
  if (token.type === TokenTypes.OpenTagStart) {
    handleTagOpenStart(state, token);
  }

  state.caretPosition++;

  return state;
}
