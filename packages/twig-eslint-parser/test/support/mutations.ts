import { blankPreservingLineBreaks, createOffsetLocator } from '../../src/source-text.js';
import { groupTwigBlocks } from '../../src/twig/blocks.js';
import { tokenizeTwig } from '../../src/twig/tokens.js';
import { measureLineCoverage, statusOfDamage } from './line-coverage.js';
import type { TwigBlock } from '../../src/twig/blocks.js';
import type { DamageSpan } from './line-coverage.js';

export type MutationKind = 'defect' | 'harmless';
export type Edit = { readonly start: number; readonly end: number; readonly replacement: string };
export type Mutator = {
  readonly name: string;
  readonly kind: MutationKind;
  readonly editsFor: (source: string, markup: string, blocks: readonly TwigBlock[]) => readonly Edit[];
};
export type MutationOutcome = {
  readonly mutator: string;
  readonly kind: MutationKind;
  readonly line: number;
  readonly isFlagged: boolean;
  readonly isFlaggedAtTheEdit: boolean;
  readonly isFlaggedAsFault: boolean;
  readonly flaggedCauses: readonly string[];
};

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const ELEMENTS_WITH_OWN_CONTENT_MODEL = /<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

function allMatches(pattern: RegExp, text: string): RegExpExecArray[] {
  return [...text.matchAll(pattern)];
}

function editOfMatch(match: RegExpExecArray, replacement: string): Edit {
  return { start: match.index, end: match.index + match[0].length, replacement };
}

function reversedName(name: string): string {
  return [...name].reverse().join('');
}

export const MUTATORS: readonly Mutator[] = [
  {
    name: 'drop-close-tag',
    kind: 'defect',
    editsFor: (_source, markup) => allMatches(/<\/([a-z][\w-]*)\s*>/gi, markup).filter((match) => !VOID_ELEMENTS.has((match[1] ?? '').toLowerCase())).map((match) => editOfMatch(match, '')),
  },
  {
    name: 'stray-close-tag',
    kind: 'defect',
    editsFor: (_source, markup) => allMatches(/<\/[a-z][\w-]*\s*>/gi, markup).map((match) => ({ start: match.index + match[0].length, end: match.index + match[0].length, replacement: '</marquee>' })),
  },
  {
    name: 'misspell-close-tag',
    kind: 'defect',
    editsFor: (_source, markup) => allMatches(/<\/([a-z]{3,}?)\s*>/gi, markup).filter((match) => match[1] !== reversedName(match[1] ?? '')).map((match) => editOfMatch(match, `</${reversedName(match[1] ?? '')}>`)),
  },
  {
    name: 'swap-adjacent-close-tags',
    kind: 'defect',
    editsFor: (_source, markup) => allMatches(/<\/([a-z][\w-]*)>(\s*)<\/([a-z][\w-]*)>/gi, markup).filter((match) => match[1] !== match[3]).map((match) => editOfMatch(match, `</${match[3]}>${match[2]}</${match[1]}>`)),
  },
  {
    name: 'unterminate-open-tag',
    kind: 'defect',
    editsFor: (_source, markup) => allMatches(/<[a-z][\w-]*(?:\s+[\w:@.-]+(?:="[^"<>]*")?)*\s*>/gi, markup).map((match) => ({ start: match.index + match[0].length - 1, end: match.index + match[0].length, replacement: '' })),
  },
  {
    name: 'unterminate-attribute-quote',
    kind: 'defect',
    editsFor: (_source, markup) => allMatches(/(?<=<[a-z][^<>]*\s[\w:-]+="[^"<>]*)"/gi, markup).map((match) => editOfMatch(match, '')),
  },
  {
    name: 'unterminate-print',
    kind: 'defect',
    editsFor: (_source, _markup, blocks) => blocks.filter((block) => block.kind === 'print').map((block) => ({ start: block.end - 2, end: block.end, replacement: '' })),
  },
  {
    name: 'invalid-print-expression',
    kind: 'defect',
    editsFor: (source, _markup, blocks) => blocks.filter((block) => block.kind === 'print' && /^\{\{[-~]?\s*[\w.]+\s*[-~]?\}\}$/.test(source.slice(block.start, block.end))).map((block) => ({ start: block.start, end: block.end, replacement: '{{ a b }}' })),
  },
  {
    name: 'drop-endif',
    kind: 'defect',
    editsFor: (_source, _markup, blocks) => blocks.filter((block) => block.tagName === 'endif').map((block) => ({ start: block.start, end: block.end, replacement: ' '.repeat(block.end - block.start) })),
  },
  {
    name: 'drop-endfor',
    kind: 'defect',
    editsFor: (_source, _markup, blocks) => blocks.filter((block) => block.tagName === 'endfor').map((block) => ({ start: block.start, end: block.end, replacement: ' '.repeat(block.end - block.start) })),
  },
  {
    name: 'tab-between-attributes',
    kind: 'harmless',
    editsFor: (_source, markup) => allMatches(/(?<=<[a-z][^<>]*")\s(?=[\w:-]+=")/gi, markup).map((match) => editOfMatch(match, '\t')),
  },
  {
    name: 'append-text',
    kind: 'harmless',
    editsFor: (_source, markup) => allMatches(/<\/p>/gi, markup).map((match) => ({ start: match.index, end: match.index, replacement: ' more' })),
  },
  {
    name: 'append-html-comment',
    kind: 'harmless',
    editsFor: (_source, markup) => allMatches(/<\/[a-z][\w-]*\s*>/gi, markup).map((match) => ({ start: match.index + match[0].length, end: match.index + match[0].length, replacement: '<!-- x -->' })),
  },
];

// Blanks everything a close or open tag pattern must not match: Twig, HTML comments, and script, style, textarea and title content.
export function markupForMutation(source: string, blocks: readonly TwigBlock[]): string {
  let markup = source;
  for (const block of blocks) {
    markup = markup.slice(0, block.start) + blankPreservingLineBreaks(markup.slice(block.start, block.end)) + markup.slice(block.end);
  }
  return markup.replace(HTML_COMMENT, blankPreservingLineBreaks).replace(ELEMENTS_WITH_OWN_CONTENT_MODEL, blankPreservingLineBreaks);
}

function applyEdit(source: string, edit: Edit): string {
  return source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
}

function pickEdit(edits: readonly Edit[], seed: number): Edit | undefined {
  return edits[seed % edits.length];
}

export function seedFrom(text: string): number {
  let hash = 2166136261;
  for (const character of text) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  }
  return hash;
}

function spanKey(span: DamageSpan): string {
  return `${span.cause}|${span.startLine}|${span.endLine}`;
}

function newSpansOf(mutantSpans: readonly DamageSpan[], originalSpans: readonly DamageSpan[]): DamageSpan[] {
  const known = new Set(originalSpans.map(spanKey));
  return mutantSpans.filter((span) => !known.has(spanKey(span)));
}

function measureMutant(mutant: string): readonly DamageSpan[] {
  try {
    return measureLineCoverage(mutant, { kind: 'own-lexer' }).spans;
  } catch {
    return [{ cause: 'unparseable', startLine: 1, endLine: Number.MAX_SAFE_INTEGER, detail: 'the measurement crashed' }];
  }
}

// Applies one edit per mutator to a template and records whether the line measurement notices.
export function runMutations(source: string, seed: number): MutationOutcome[] {
  const blocks = groupTwigBlocks(tokenizeTwig(source));
  const markup = markupForMutation(source, blocks);
  const originalSpans = measureLineCoverage(source, { kind: 'own-lexer' }).spans;
  const lineOf = createOffsetLocator(source);
  return MUTATORS.flatMap((mutator): MutationOutcome[] => {
    const edit = pickEdit(mutator.editsFor(source, markup, blocks), seed + seedFrom(mutator.name));
    if (!edit) {
      return [];
    }
    const line = lineOf(edit.start).line;
    const added = newSpansOf(measureMutant(applyEdit(source, edit)), originalSpans);
    return [{
      mutator: mutator.name,
      kind: mutator.kind,
      line,
      isFlagged: added.length > 0,
      isFlaggedAtTheEdit: added.some((span) => span.startLine <= line && line <= span.endLine),
      isFlaggedAsFault: added.some((span) => statusOfDamage(span.cause) === 'fault'),
      flaggedCauses: [...new Set(added.map((span) => span.cause))],
    }];
  });
}
