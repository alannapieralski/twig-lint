import { createRequire } from 'node:module';
import { parseForESLint } from './parse-for-eslint.js';

const { name, version } = createRequire(import.meta.url)('../package.json') as { name: string; version: string };

export const meta = { name, version };

export { parseForESLint };
export { readTwigServices } from './services.js';
export { findInterpolatedStrings } from './twig/strings.js';
export type { TwigQuote, TwigStringSummary } from './twig/strings.js';
export type { ParserOptions, TwigParseResult, TwigParserServices } from './parse-for-eslint.js';
export { DIAGNOSTIC_CODES } from './diagnostics.js';
export type { DiagnosticCode, TwigDiagnostic } from './diagnostics.js';
export { containsTwig, isAttributeNode, isNamedAttribute } from './attributes.js';
export type { AttributeNode, AttributeOwner, NamedAttributeNode, OmittedAttribute } from './attributes.js';
export type { TwigBlockSummary } from './twig/blocks.js';
export { isClosingTag, isMiddleTag, isOpeningTag } from './twig/block-roles.js';
export { ELEMENT_NODE_TYPES, RAW_TEXT_ELEMENT_NAMES, SINGLE_TOKEN_NODE_TYPES } from './html/syntax.js';
export { isRangeWithin } from './range.js';
export { depthChangeWithin, isTwigBalancedWithin } from './twig/balance.js';
export { HtmlSyntaxError } from './html/syntax-error.js';
export { TwigSyntaxError } from './twig/tokens.js';

export default { meta, parseForESLint };
