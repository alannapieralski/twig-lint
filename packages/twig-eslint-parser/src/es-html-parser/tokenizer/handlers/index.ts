import { TokenizeHandler } from "../../types/index.js";

export * as attributeKey from "./attribute-key.js";
export * as attributeValueBare from "./attribute-value-bare.js";
export * as attributeValueWrapped from "./attribute-value-wrapped.js";
export * as attributeValue from "./attribute-value.js";
export * as attributes from "./attributes.js";
export * as closeTag from "./close-tag.js";
export * as commentContent from "./comment-content.js";
export * as data from "./data.js";
export * as doctypeAttributeBare from "./doctype-attribute-bare.js";
export * as doctypeAttributeWrapped from "./doctype-attribute-wrapped.js";
export * as doctypeAttributes from "./doctype-attributes.js";
export * as DoctypeClose from "./doctype-end.js";
export * as DoctypeOpen from "./doctype-start.js";
export * as openTagEnd from "./open-tag-end.js";
export * as openTagStart from "./open-tag-start.js";
export * as rawText from "./raw-text.js";
export const noop: TokenizeHandler = {
  parse: () => void 0,
};
