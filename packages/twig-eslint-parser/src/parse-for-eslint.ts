import { unionWith } from 'eslint-visitor-keys';
import { omitInterpolatedAttributes } from './attributes.js';
import { compareDiagnostics } from './diagnostics.js';
import { findMarkupDiagnostics } from './html/diagnostics/find-markup-diagnostics.js';
import { parseMarkup } from './html/parse-markup.js';
import { parseTwigParserOptions } from './options.js';
import { createOffsetLocator } from './source-text.js';
import { blockRangeOf, groupTwigBlocks, summariseTwigBlocks } from './twig/blocks.js';
import { findMisplacedTagDiagnostics, pairTwigTags } from './twig/tag-structure.js';
import { summariseTwigStrings } from './twig/strings.js';
import { parseTwigBlock } from './twig/tag-grammar.js';
import { TwigSyntaxError, tokenizeTwig } from './twig/tokens.js';
import type { Linter } from 'eslint';
import type { OmittedAttribute } from './attributes.js';
import type { TwigDiagnostic } from './diagnostics.js';
import type { EstreeNode } from './estree.js';
import type { MarkupTreeNode } from './html/diagnostics/markup-elements.js';
import type { SourcePosition } from './source-text.js';
import type { TwigBlock, TwigBlockSummary } from './twig/blocks.js';
import type { TwigStringSummary } from './twig/strings.js';

export type ParserOptions = { readonly ignoreInterpolatedAttributes?: readonly string[]; readonly rawContentTags?: readonly string[] } & Record<string, unknown>;

export type TwigParserServices = {
  readonly convertedBlockCount: number;
  readonly ignoredBlockCount: number;
  readonly diagnostics: readonly TwigDiagnostic[];
  readonly unreadableTagStarts: readonly number[];
  readonly omittedAttributes: readonly OmittedAttribute[];
  readonly blocks: readonly TwigBlockSummary[];
  readonly strings: readonly TwigStringSummary[];
};

export type TwigParseResult = Omit<Linter.ESLintParseResult, 'ast' | 'services'> & {
  readonly ast: Linter.ESLintParseResult['ast'] & { readonly twigBody: readonly EstreeNode[] };
  readonly services: Record<string, unknown> & { readonly twig: TwigParserServices };
};

type TwigExpressions = {
  readonly statements: EstreeNode[];
  readonly convertedBlockCount: number;
  readonly ignoredBlockCount: number;
  readonly unparsedBlockDiagnostics: TwigDiagnostic[];
};

function describeUnparsedBlock(block: TwigBlock, reason: string): TwigDiagnostic {
  return { code: 'x-unparsed-twig', message: `This Twig block could not be parsed: ${reason}`, range: blockRangeOf(block) };
}

function convertTwigBlocks(blocks: readonly TwigBlock[], openerIndexByBlockIndex: ReadonlyMap<number, number>, locate: (offset: number) => SourcePosition): TwigExpressions {
  const statements: EstreeNode[] = [];
  const unparsedBlockDiagnostics: TwigDiagnostic[] = [];
  let convertedBlockCount = 0;
  let ignoredBlockCount = 0;

  for (const [index, block] of blocks.entries()) {
    const openerIndex = openerIndexByBlockIndex.get(index);
    const opener = openerIndex === undefined ? undefined : blocks[openerIndex];
    const parsed = parseTwigBlock(block, locate, opener);
    if (parsed === undefined) {
      ignoredBlockCount += 1;
      continue;
    }
    if (!parsed.isParsed) {
      unparsedBlockDiagnostics.push(describeUnparsedBlock(block, parsed.reason));
      continue;
    }
    convertedBlockCount += 1;
    statements.push(...parsed.statements);
  }

  return { statements, convertedBlockCount, ignoredBlockCount, unparsedBlockDiagnostics };
}

function parseMarkupWithinStack(code: string, blocks: readonly TwigBlock[], rawContentTags: ReadonlySet<string>) {
  try {
    return parseMarkup(code, blocks, rawContentTags);
  } catch (error) {
    if (error instanceof RangeError && /call stack/i.test(error.message)) {
      throw new Error('twig-eslint-parser could not parse this file because its markup is nested too deeply.', { cause: error });
    }
    throw error;
  }
}

export function parseForESLint(code: string, options: ParserOptions = {}): TwigParseResult {
  const { ignoreInterpolatedAttributes, rawContentTags } = parseTwigParserOptions(options);
  const tokens = tokenizeTwig(code);
  const blocks = groupTwigBlocks(tokens);
  const blockSummaries = summariseTwigBlocks(blocks);
  const tagPairs = pairTwigTags(blockSummaries);
  if (!tagPairs.isPaired) {
    const { line, column } = createOffsetLocator(code)(tagPairs.unpairedTag.block.range[0]);
    throw new TwigSyntaxError(tagPairs.unpairedTag.message, line, column + 1);
  }
  const misplacedTagDiagnostics = findMisplacedTagDiagnostics(blockSummaries, tagPairs.openerIndexByBlockIndex);

  const markup = parseMarkupWithinStack(code, blocks, rawContentTags);
  const { diagnostics: markupDiagnostics, unreadableTagStarts } = findMarkupDiagnostics({ errors: markup.errors, document: markup.ast.body[0] as MarkupTreeNode, text: code, blocks: blockSummaries });
  const omittedAttributes = omitInterpolatedAttributes(markup.ast, ignoreInterpolatedAttributes);
  const { statements, unparsedBlockDiagnostics, ...blockCounts } = convertTwigBlocks(blocks, tagPairs.openerIndexByBlockIndex, createOffsetLocator(code));
  const diagnostics = [...markupDiagnostics, ...misplacedTagDiagnostics, ...unparsedBlockDiagnostics].sort(compareDiagnostics);
  const visitorKeys = unionWith(markup.visitorKeys);
  const ast = { ...markup.ast, twigBody: statements } as unknown as TwigParseResult['ast'];

  return {
    ast,
    visitorKeys: { ...visitorKeys, Program: [...(visitorKeys['Program'] ?? []), 'twigBody'] },
    services: { twig: { ...blockCounts, diagnostics, unreadableTagStarts, omittedAttributes, blocks: blockSummaries, strings: summariseTwigStrings(tokens) } },
  };
}
