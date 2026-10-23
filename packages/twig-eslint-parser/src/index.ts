import { createRequire } from 'node:module';
import { parseForESLint } from './parse-for-eslint.js';

const { name, version } = createRequire(import.meta.url)('../package.json') as { name: string; version: string };

export const meta = { name, version };

export { parseForESLint };
export { readTwigServices } from './services.js';
export { findInterpolatedStrings } from './twig/strings.js';
export type { TwigQuote, TwigStringSummary } from './twig/strings.js';
export type { ParserOptions, TwigParseResult, TwigParserServices, UnconvertedTwigBlock } from './parse-for-eslint.js';
export { containsTwig, isAttributeNode } from './attributes.js';
export type { AttributeNode, AttributeOwner, OmittedAttribute } from './attributes.js';
export type { TwigBlockSummary } from './twig/blocks.js';
export { middleTags } from './twig/syntax.js';
export { HtmlSyntaxError } from './html/syntax-error.js';
export { TwigSyntaxError } from './twig/tokens.js';

export default { meta, parseForESLint };
