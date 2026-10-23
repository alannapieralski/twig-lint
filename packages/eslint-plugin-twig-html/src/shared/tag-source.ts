import type { SourceCode } from 'eslint';
import type { TwigBlockSummary, TwigParserServices } from 'twig-eslint-parser';
import { createIgnoredInsideCheck } from './ignored-inside.js';
import { lineBreakUsedIn } from './line-ending.js';
import { findUnsoundTagStarts } from './unsound-open-tags.js';
import { createAttributesOf, type AttributesOf } from './tag-attributes.js';
import type { TagNode } from './tag-node.js';

export type TagSource = {
  readonly text: string;
  readonly lineBreak: string;
  readonly blocks: readonly TwigBlockSummary[];
  readonly attributesOf: AttributesOf;
  readonly isIgnored: (tag: TagNode) => boolean;
  readonly unsoundTagStarts: ReadonlySet<number>;
};

export function createTagSource(sourceCode: SourceCode, services: TwigParserServices, ignores: readonly string[]): TagSource {
  const { text } = sourceCode;

  return {
    text,
    lineBreak: lineBreakUsedIn(text),
    blocks: services.blocks,
    attributesOf: createAttributesOf(services.omittedAttributes),
    isIgnored: createIgnoredInsideCheck(sourceCode, ignores),
    unsoundTagStarts: findUnsoundTagStarts(services.diagnostics),
  };
}
