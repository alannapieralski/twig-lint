import { parseForESLint } from '../../src/index.js';
import { createOffsetLocator } from '../../src/source-text.js';
import { groupTwigBlocks, type TwigBlock } from '../../src/twig/blocks.js';
import { tokenizeTwig } from '../../src/twig/tokens.js';
import type { OutputIssue } from './output-checks.js';

export type Rewrite = { readonly name: string; readonly apply: (source: string, blocks: readonly TwigBlock[]) => string };
export type TreeParser = (source: string) => { readonly ast: { readonly body: unknown; readonly twigBody: unknown } };

type Edit = { readonly at: number; readonly remove: number; readonly insert: string };
type Entry = { readonly depth: number; readonly description: string; readonly offset: number };
type Tree = { readonly html: readonly Entry[]; readonly twig: readonly Entry[] };

const keysNeverCompared = new Set(['parent', 'loc', 'range', 'start', 'end', 'raw', 'parts', 'stylesheet', 'tokens', 'comments', 'openStart', 'openEnd', 'close', 'startWrapper', 'endWrapper', 'open']);
const delimiterNeighbours = /[-~{}%#]/;
const attributeNameCharacter = /[\w:@.-]/;

function applyEdits(source: string, edits: readonly Edit[]): string {
  let result = source;
  for (const edit of [...edits].sort((first, second) => second.at - first.at)) {
    result = result.slice(0, edit.at) + edit.insert + result.slice(edit.at + edit.remove);
  }
  return result;
}

function innerWhitespaceTokens(block: TwigBlock): { readonly leading?: TwigBlock['tokens'][number]; readonly trailing?: TwigBlock['tokens'][number] } {
  const tokens = block.tokens.filter((token) => token.type !== 'TRIMMING_MODIFIER' && token.type !== 'LINE_TRIMMING_MODIFIER');
  const leading = tokens[1]?.type === 'WHITESPACE' ? tokens[1] : undefined;
  const trailing = tokens.at(-2)?.type === 'WHITESPACE' ? tokens.at(-2) : undefined;
  return { ...(leading && { leading }), ...(trailing && trailing !== leading && { trailing }) };
}

function tightenDelimiters(source: string, blocks: readonly TwigBlock[]): string {
  const edits = blocks.filter((block) => block.kind !== 'comment').flatMap((block): Edit[] => {
    const { leading, trailing } = innerWhitespaceTokens(block);
    const safe = (token: TwigBlock['tokens'][number] | undefined, neighbour: string | undefined) => token && neighbour !== undefined && !delimiterNeighbours.test(neighbour);
    return [
      ...(safe(leading, leading && source[leading.end]) && leading ? [{ at: leading.start, remove: leading.end - leading.start, insert: '' }] : []),
      ...(safe(trailing, trailing && source[trailing.start - 1]) && trailing ? [{ at: trailing.start, remove: trailing.end - trailing.start, insert: '' }] : []),
    ];
  });
  return applyEdits(source, edits);
}

function padDelimiters(source: string, blocks: readonly TwigBlock[]): string {
  const edits = blocks.filter((block) => block.kind !== 'comment').flatMap((block): Edit[] => {
    const { leading, trailing } = innerWhitespaceTokens(block);
    const opening = block.tokens.find((token) => token.type !== 'VARIABLE_START' && token.type !== 'TAG_START' && token.type !== 'TRIMMING_MODIFIER' && token.type !== 'LINE_TRIMMING_MODIFIER');
    const closing = [...block.tokens].reverse().find((token) => token.type !== 'VARIABLE_END' && token.type !== 'TAG_END' && token.type !== 'TRIMMING_MODIFIER' && token.type !== 'LINE_TRIMMING_MODIFIER');
    if (!opening || !closing) return [];
    return [...(leading ? [] : [{ at: opening.start, remove: 0, insert: ' ' }]), ...(trailing ? [] : [{ at: closing.end, remove: 0, insert: ' ' }])];
  });
  return applyEdits(source, edits);
}

function findBlocksInsideStartTags(source: string, blocks: readonly TwigBlock[]): TwigBlock[] {
  const blockByStart = new Map(blocks.map((block) => [block.start, block]));
  const insideTags: TwigBlock[] = [];
  let isInTag = false;
  let quote: string | undefined;
  for (let index = 0; index < source.length; index += 1) {
    const block = blockByStart.get(index);
    if (block) {
      if (isInTag && quote === undefined) insideTags.push(block);
      index = block.end - 1;
      continue;
    }
    const character = source[index] ?? '';
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (!isInTag && character === '<' && /[A-Za-z]/.test(source[index + 1] ?? '')) isInTag = true;
    else if (isInTag && (character === '"' || character === "'")) quote = character;
    else if (isInTag && character === '>') isInTag = false;
  }
  return insideTags;
}

function isGluedToTagName(source: string, block: TwigBlock): boolean {
  return /^<[A-Za-z][^\s>]*$/.test(source.slice(source.lastIndexOf('<', block.start), block.start));
}

function separateTwigTagsFromAttributeNames(source: string, blocks: readonly TwigBlock[]): string {
  const edits = findBlocksInsideStartTags(source, blocks).filter((block) => block.kind !== 'print' && !isGluedToTagName(source, block)).flatMap((block): Edit[] => [
    ...(attributeNameCharacter.test(source[block.start - 1] ?? '') ? [{ at: block.start, remove: 0, insert: ' ' }] : []),
    ...(attributeNameCharacter.test(source[block.end] ?? '') ? [{ at: block.end, remove: 0, insert: ' ' }] : []),
  ]);
  return applyEdits(source, edits);
}

function useWindowsLineEndings(source: string): string {
  return source.replace(/\r?\n/g, '\r\n');
}

export const rewrites: readonly Rewrite[] = [
  { name: 'Twig delimiters without inner spaces', apply: tightenDelimiters },
  { name: 'Twig delimiters with inner spaces', apply: padDelimiters },
  { name: 'Twig tags spaced from attribute names', apply: separateTwigTagsFromAttributeNames },
  { name: 'Windows line endings', apply: useWindowsLineEndings },
];

function normaliseText(text: string): string {
  return text.replace(/\s+/g, '');
}

function describeNode(node: Record<string, unknown>): string {
  const fields = Object.entries(node)
    .filter(([key, value]) => !keysNeverCompared.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))
    .map(([key, value]) => `${key}=${typeof value === 'string' ? JSON.stringify(normaliseText(value)) : String(value)}`);
  const closure = 'openStart' in node ? [`closed=${String(node['close'] !== undefined || node['selfClosing'] === true)}`] : [];
  return [String(node['type']), ...fields, ...closure].join(' ');
}

function flatten(root: unknown): Entry[] {
  const entries: Entry[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown, depth: number): void => {
    if (typeof value !== 'object' || value === null || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, depth));
      return;
    }
    const node = value as Record<string, unknown>;
    const isNode = typeof node['type'] === 'string';
    if (isNode && !(node['type'] === 'Text' && typeof node['value'] === 'string' && node['value'].trim() === '')) {
      const range = node['range'] as [number, number] | undefined;
      entries.push({ depth, description: describeNode(node), offset: range?.[0] ?? 0 });
    }
    for (const [key, child] of Object.entries(node)) {
      if (!keysNeverCompared.has(key)) visit(child, isNode ? depth + 1 : depth);
    }
  };
  visit(root, 0);
  return entries;
}

function massagedTree(source: string, parse: TreeParser): Tree | undefined {
  try {
    const { ast } = parse(source);
    return { html: flatten(ast.body), twig: flatten(ast.twigBody) };
  } catch {
    return undefined;
  }
}

function firstDifference(original: readonly Entry[], rewritten: readonly Entry[]): { readonly original?: Entry; readonly rewritten?: Entry } | undefined {
  const length = Math.max(original.length, rewritten.length);
  for (let index = 0; index < length; index += 1) {
    const before = original[index];
    const after = rewritten[index];
    if (before?.description === after?.description && before?.depth === after?.depth) continue;
    return { ...(before && { original: before }), ...(after && { rewritten: after }) };
  }
  return undefined;
}

function describeEntry(entry: Entry | undefined): string {
  return entry ? `${'  '.repeat(Math.min(entry.depth, 3))}${entry.description}`.slice(0, 80) : '(nothing)';
}

export function checkRewritesKeepTheTree(source: string, selected: readonly Rewrite[] = rewrites, parse: TreeParser = parseForESLint): OutputIssue[] {
  let blocks: TwigBlock[];
  try {
    blocks = groupTwigBlocks(tokenizeTwig(source));
  } catch {
    return [];
  }
  const original = massagedTree(source, parse);
  if (!original) return [];
  const locate = createOffsetLocator(source);
  const issues: OutputIssue[] = [];
  for (const rewrite of selected) {
    const rewritten = rewrite.apply(source, blocks);
    if (rewritten === source) continue;
    const tree = massagedTree(rewritten, parse);
    if (!tree) {
      issues.push({ check: `metamorphic: ${rewrite.name}: parses`, detail: 'the rewritten template no longer parses' });
      continue;
    }
    for (const part of ['html', 'twig'] as const) {
      const difference = firstDifference(original[part], tree[part]);
      if (!difference) continue;
      const offset = difference.original?.offset ?? original[part].at(-1)?.offset ?? 0;
      issues.push({
        check: `metamorphic: ${rewrite.name}: ${part}`,
        detail: `${describeEntry(difference.original)} became ${describeEntry(difference.rewritten)}`,
        line: locate(offset).line,
      });
    }
  }
  return issues;
}
