import type { Linter } from 'eslint';
import { unionWith } from 'eslint-visitor-keys';
import { omitInterpolatedAttributes, type OmittedAttribute } from './attributes.js';
import { parseJavaScriptAt, type EstreeNode } from './estree.js';
import { parseMarkup } from './html/parse-markup.js';
import { parseTwigParserOptions } from './options.js';
import { createOffsetLocator, type SourcePosition } from './source-text.js';
import { groupTwigBlocks, summariseTwigBlocks, type TwigBlock, type TwigBlockKind, type TwigBlockSummary } from './twig/blocks.js';
import { findUnpairedTwigTag } from './twig/pairing.js';
import { toSameLengthJavaScript } from './twig/javascript.js';
import { summariseTwigStrings, type TwigStringSummary } from './twig/strings.js';
import { TwigSyntaxError, tokenizeTwig } from './twig/tokens.js';

export type ParserOptions = { readonly ignoreInterpolatedAttributes?: readonly string[]; readonly rawContentTags?: readonly string[] } & Record<string, unknown>;

export type UnconvertedTwigBlock = {
  readonly kind: TwigBlockKind;
  readonly tagName: string | undefined;
  readonly range: readonly [number, number];
  readonly reason: string;
};

export type TwigParserServices = {
  readonly convertedBlockCount: number;
  readonly ignoredBlockCount: number;
  readonly unconvertedBlocks: readonly UnconvertedTwigBlock[];
  readonly omittedAttributes: readonly OmittedAttribute[];
  readonly blocks: readonly TwigBlockSummary[];
  readonly strings: readonly TwigStringSummary[];
};

export type TwigParseResult = Omit<Linter.ESLintParseResult, 'ast' | 'services'> & {
  readonly ast: Linter.ESLintParseResult['ast'] & { readonly twigBody: readonly EstreeNode[] };
  readonly services: Record<string, unknown> & { readonly twig: TwigParserServices };
};

type TwigExpressions = Omit<TwigParserServices, 'omittedAttributes' | 'blocks' | 'strings'> & { readonly statements: EstreeNode[] };

function convertTwigBlocks(blocks: readonly TwigBlock[], locate: (offset: number) => SourcePosition): TwigExpressions {
  const statements: EstreeNode[] = [];
  const unconvertedBlocks: UnconvertedTwigBlock[] = [];
  let convertedBlockCount = 0;
  let ignoredBlockCount = 0;

  for (const block of blocks) {
    const javascript = toSameLengthJavaScript(block);
    if (javascript === undefined) {
      ignoredBlockCount += 1;
      continue;
    }

    const parsed = parseJavaScriptAt(javascript, block.start, locate);
    if (!parsed.isParsed) {
      unconvertedBlocks.push({ kind: block.kind, tagName: block.tagName, range: [block.start, block.end], reason: parsed.reason });
      continue;
    }

    convertedBlockCount += 1;
    statements.push(...parsed.statements);
  }

  return { statements, convertedBlockCount, ignoredBlockCount, unconvertedBlocks };
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
  const unpairedTag = findUnpairedTwigTag(blockSummaries);
  if (unpairedTag) {
    const { line, column } = createOffsetLocator(code)(unpairedTag.block.range[0]);
    throw new TwigSyntaxError(unpairedTag.message, line, column + 1);
  }

  const markup = parseMarkupWithinStack(code, blocks, rawContentTags);
  const omittedAttributes = omitInterpolatedAttributes(markup.ast, ignoreInterpolatedAttributes);
  const { statements, ...twigServices } = convertTwigBlocks(blocks, createOffsetLocator(code));
  const visitorKeys = unionWith(markup.visitorKeys);
  const ast = { ...markup.ast, twigBody: statements } as unknown as TwigParseResult['ast'];

  return {
    ast,
    visitorKeys: { ...visitorKeys, Program: [...(visitorKeys['Program'] ?? []), 'twigBody'] },
    services: { twig: { ...twigServices, omittedAttributes, blocks: blockSummaries, strings: summariseTwigStrings(tokens) } },
  };
}
