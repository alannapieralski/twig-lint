import { blockTags } from './syntax.js';
import { isSignificant, type TwigToken, type TwigTokenType } from './tokens.js';

export type TwigBlockKind = 'print' | 'tag' | 'comment';

export type TwigBlock = {
  readonly kind: TwigBlockKind;
  readonly start: number;
  readonly end: number;
  readonly tokens: readonly TwigToken[];
  readonly tagName: string | undefined;
};

export type TwigBlockSummary = {
  readonly kind: TwigBlockKind;
  readonly tagName: string | undefined;
  readonly range: readonly [number, number];
  readonly depthChange: -1 | 0 | 1;
  readonly bracketPairs: readonly (readonly [number, number])[];
};

const openingBrackets: ReadonlySet<string> = new Set(['{', '[', '(']);
const closingBrackets: ReadonlySet<string> = new Set(['}', ']', ')']);

function findBracketPairs(block: TwigBlock): (readonly [number, number])[] {
  const pairs: (readonly [number, number])[] = [];
  const openOffsets: number[] = [];

  for (const token of block.tokens) {
    if (token.type !== 'PUNCTUATION') continue;
    if (openingBrackets.has(token.value)) openOffsets.push(token.start);
    if (!closingBrackets.has(token.value)) continue;

    const openOffset = openOffsets.pop();
    if (openOffset === undefined) throw new Error(`A Twig bracket closes at ${token.start} without having opened.`);
    pairs.push([openOffset, token.start]);
  }

  return pairs.sort((first, second) => first[0] - second[0]);
}

function tokensAfterTagName(block: TwigBlock): TwigToken[] {
  const content = block.tokens.slice(1, -1).filter(isSignificant);
  return content.slice(1);
}

export function isShortFormTag(block: TwigBlock): boolean {
  const [firstAfterName, secondAfterName] = tokensAfterTagName(block);

  switch (block.tagName) {
    case 'set':
      return block.tokens.some((token) => token.type === 'OPERATOR' && token.value === '=');
    case 'block':
      return secondAfterName !== undefined;
    case 'trans':
      return firstAfterName?.type === 'OPENING_QUOTE';
    default:
      return false;
  }
}

function opensNesting(block: TwigBlock, closedTagNames: ReadonlySet<string>): boolean {
  if (block.tagName === undefined || !(blockTags.has(block.tagName) || closedTagNames.has(block.tagName))) return false;
  return !isShortFormTag(block);
}

function nestingDepthChange(block: TwigBlock, closedTagNames: ReadonlySet<string>): TwigBlockSummary['depthChange'] {
  if (block.tagName?.startsWith('end')) return -1;
  return opensNesting(block, closedTagNames) ? 1 : 0;
}

export function summariseTwigBlocks(blocks: readonly TwigBlock[]): TwigBlockSummary[] {
  const closedTagNames = new Set(blocks.flatMap((block) => (block.tagName?.startsWith('end') ? [block.tagName.slice('end'.length)] : [])));
  return blocks.map((block) => ({ kind: block.kind, tagName: block.tagName, range: [block.start, block.end], depthChange: nestingDepthChange(block, closedTagNames), bracketPairs: findBracketPairs(block) }));
}

const blockKindByOpeningType: Partial<Record<TwigTokenType, { kind: TwigBlockKind; closingType: TwigTokenType }>> = {
  VARIABLE_START: { kind: 'print', closingType: 'VARIABLE_END' },
  TAG_START: { kind: 'tag', closingType: 'TAG_END' },
  COMMENT_START: { kind: 'comment', closingType: 'COMMENT_END' },
};

function createBlock(kind: TwigBlockKind, tokens: TwigToken[]): TwigBlock {
  const first = tokens[0];
  const last = tokens.at(-1);
  if (!first || !last) throw new Error('A Twig block needs at least its opening and closing delimiters.');

  const tagName = kind === 'tag' ? tokens.find((token) => token.type === 'NAME')?.value : undefined;
  return { kind, start: first.start, end: last.end, tokens, tagName };
}

function findClosingIndex(tokens: readonly TwigToken[], openingIndex: number, closingType: TwigTokenType): number {
  for (let index = openingIndex + 1; index < tokens.length; index += 1) {
    if (tokens[index]?.type === closingType) return index;
  }
  return -1;
}

export function groupTwigBlocks(tokens: readonly TwigToken[]): TwigBlock[] {
  const blocks: TwigBlock[] = [];
  let index = 0;

  while (index < tokens.length) {
    const opening = tokens[index];
    const blockKind = opening && blockKindByOpeningType[opening.type];
    if (!blockKind) {
      index += 1;
      continue;
    }

    const closingIndex = findClosingIndex(tokens, index, blockKind.closingType);
    if (closingIndex === -1) throw new Error(`Twig ${blockKind.kind} block opened at offset ${opening.start} has no closing delimiter.`);

    blocks.push(createBlock(blockKind.kind, tokens.slice(index, closingIndex + 1)));
    index = closingIndex + 1;
  }

  return blocks;
}
