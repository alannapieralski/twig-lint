import { parseForESLint, type TwigParseResult } from 'twig-eslint-parser';
import type { AppliedFix } from './fixing.js';

export type FixKeeps = 'layout' | 'class-tokens' | 'code';
export type FixProblem = { readonly message: string; readonly offset?: number };
export type FixReview = { readonly problems: readonly FixProblem[]; readonly notes: readonly FixProblem[] };
type ClassListReview = { readonly problems: readonly string[]; readonly notes: readonly string[] };
type Token = { readonly text: string; readonly start: number };
export type ClassRuleRoles = { readonly rewritesClasses?: ReadonlySet<string>; readonly removesDuplicateClasses?: ReadonlySet<string> };
type ClassList = { readonly delimiters: string; readonly groups: readonly (readonly string[])[]; readonly twig: readonly string[] };

type Range = readonly [number, number];
type Leaf = { readonly type: string; readonly range: Range; readonly isPreformatted: boolean };
type ParsedTemplate = { readonly result: TwigParseResult } | { readonly error: string };
type OpenTagRange = { readonly start: number; readonly attributesStart: number; readonly closeBracketStart: number };

const keysOutsideTheHtmlTree = new Set(['parent', 'loc', 'range', 'parts', 'stylesheet']);
const cubeDelimiters = new Set(['[', ']', '|', '][']);
const twigSpan = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g;
const indentationAfterLineBreak = /(\n)[ \t]+/g;
const leadingIndentation = /[ \t]*/y;
const preformattedElements = new Set(['pre', 'textarea']);
const layoutTextTypes = new Set(['Text', 'RawContent']);
const leavesWithLooseEdges = new Set(['Text', 'ScriptTagContent', 'StyleTagContent']);
const lineBreak = /\r\n|\r|\n/g;
const lineBreakNames: Readonly<Record<string, string>> = { '\r\n': '\\r\\n', '\r': '\\r', '\n': '\\n' };

function parse(code: string): ParsedTemplate {
  try {
    return { result: parseForESLint(code) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function isPreformattedElement(node: Record<string, unknown>): boolean {
  return node['type'] === 'Tag' && typeof node['name'] === 'string' && preformattedElements.has(node['name'].toLowerCase());
}

function collectLeaves(value: unknown, leaves: Leaf[] = [], seen = new Set<object>(), isPreformatted = false): Leaf[] {
  if (typeof value !== 'object' || value === null || seen.has(value)) return leaves;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child) => collectLeaves(child, leaves, seen, isPreformatted));
    return leaves;
  }
  const node = value as Record<string, unknown>;
  if (typeof node['type'] === 'string' && typeof node['value'] === 'string' && Array.isArray(node['range'])) {
    leaves.push({ type: node['type'], range: node['range'] as unknown as Range, isPreformatted });
  }
  const isChildPreformatted = isPreformatted || isPreformattedElement(node);
  for (const [key, child] of Object.entries(node)) {
    if (!keysOutsideTheHtmlTree.has(key)) collectLeaves(child, leaves, seen, isChildPreformatted);
  }
  return leaves;
}

function withoutIndentationOutsideTwig(text: string): string {
  let result = '';
  let markupStart = 0;
  for (const twig of text.matchAll(twigSpan)) {
    result += text.slice(markupStart, twig.index).replace(indentationAfterLineBreak, '$1') + twig[0];
    markupStart = twig.index + twig[0].length;
  }
  return result + text.slice(markupStart).replace(indentationAfterLineBreak, '$1');
}

function withoutIndentationOutsideStrings(span: string): string {
  let result = '';
  let openQuote: string | undefined;
  for (let index = 0; index < span.length; index += 1) {
    const character = span[index] as string;
    result += character;
    if (openQuote) {
      if (character === '\\') result += span[++index] ?? '';
      else if (character === openQuote) openQuote = undefined;
    } else if (character === '"' || character === "'") {
      openQuote = character;
    } else if (character === '\n') {
      while (span[index + 1] === ' ' || span[index + 1] === '\t') index += 1;
    }
  }
  return result;
}

function withoutIndentationInTwigExpressions(text: string): string {
  return text.replace(twigSpan, (span) => (span.startsWith('{#') ? span : withoutIndentationOutsideStrings(span)));
}

function isLayoutText(leaf: Leaf): boolean {
  return layoutTextTypes.has(leaf.type) && !leaf.isPreformatted;
}

function layoutTextOf(leaf: Leaf, text: string): string {
  if (isLayoutText(leaf)) return withoutIndentationInTwigExpressions(withoutIndentationOutsideTwig(text.trim()));
  if (leavesWithLooseEdges.has(leaf.type)) return withoutIndentationInTwigExpressions(text.trim());
  return withoutIndentationInTwigExpressions(text);
}

function layoutTokens(code: string, result: TwigParseResult): Token[] {
  return collectLeaves(result.ast.body)
    .sort((first, second) => first.range[0] - second.range[0])
    .map((leaf): Token => {
      const text = code.slice(...leaf.range);
      return { text: layoutTextOf(leaf, text), start: leaf.range[0] };
    })
    .filter((token) => token.text !== '');
}

function twigBlockShapes(result: TwigParseResult): Token[] {
  return result.services.twig.blocks.map((block) => ({ text: `${block.kind}:${block.tagName ?? ''}`, start: block.range[0] }));
}

function describeFirstDifference(before: readonly Token[], after: readonly Token[]): FixProblem | undefined {
  const length = Math.max(before.length, after.length);
  for (let index = 0; index < length; index += 1) {
    if (before[index]?.text === after[index]?.text) continue;
    const show = (token: Token | undefined) => (token === undefined ? 'nothing' : JSON.stringify(token.text.slice(0, 50)));
    const offset = before[index]?.start ?? before.at(-1)?.start;
    return { message: `${show(before[index])} became ${show(after[index])}`, ...(offset !== undefined && { offset }) };
  }
  return undefined;
}

function offsetOfAppliedFix(source: string, fix: AppliedFix): number | undefined {
  const offset = fix.replaced === '' ? -1 : source.indexOf(fix.replaced);
  return offset === -1 ? undefined : offset;
}

function withoutSurroundingQuotes(text: string): string {
  const trimmed = text.trim();
  const quote = trimmed[0];
  return quote !== undefined && '"\'`'.includes(quote) && trimmed.endsWith(quote) && trimmed.length > 1 ? trimmed.slice(1, -1) : trimmed;
}

function readClassList(text: string): ClassList {
  const twig = text.match(twigSpan) ?? [];
  const tokens = withoutSurroundingQuotes(text).replace(twigSpan, ' ').split(/\s+/).filter((token) => token !== '');
  const groups: string[][] = [[]];
  let delimiters = '';
  for (const token of tokens) {
    if (cubeDelimiters.has(token)) {
      delimiters += ` ${token}`;
      groups.push([]);
    } else {
      groups.at(-1)?.push(token);
    }
  }
  return { delimiters, groups, twig };
}

function withoutItems(items: readonly string[], removed: ReadonlySet<string>): string[] {
  return [...new Set(items)].filter((item) => !removed.has(item));
}

function sameSet(first: readonly string[], second: readonly string[]): boolean {
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  return firstSet.size === secondSet.size && [...firstSet].every((item) => secondSet.has(item));
}

function countEach(items: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

function findAddedDuplicates(before: readonly string[], after: readonly string[]): string[] {
  const countsBefore = countEach(before);
  return [...countEach(after)].filter(([className, count]) => count > 1 && count > (countsBefore.get(className) ?? 0)).map(([className]) => className);
}

function occursMoreThanOnce(source: string, className: string): boolean {
  const pattern = new RegExp(`(^|[\\s"'])${className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s"']|$)`, 'g');
  return (source.match(pattern) ?? []).length > 1;
}

function reviewClassListFix(fix: AppliedFix, source: string, roles: ClassRuleRoles): ClassListReview {
  const before = readClassList(fix.replaced);
  const after = readClassList(fix.replacement);
  const rule = fix.ruleId ?? 'a rule';
  if (before.twig.join('\n') !== after.twig.join('\n')) return { problems: [`${rule} changes Twig inside a class list`], notes: [] };
  if (before.delimiters !== after.delimiters) {
    return { problems: [`${rule} moves or removes class group delimiters:${before.delimiters || ' none'} became${after.delimiters || ' none'}`], notes: [] };
  }
  const beforeClasses = before.groups.flat();
  const afterClasses = after.groups.flat();
  const addedDuplicates = findAddedDuplicates(beforeClasses, afterClasses);
  if (addedDuplicates.length > 0) return { problems: [`${rule} duplicates classes: ${addedDuplicates.join(' ')}`], notes: [] };
  const regroups = before.groups.some((group, index) => !sameSet(group, after.groups[index] ?? []));
  if (sameSet(beforeClasses, afterClasses)) {
    if (regroups) return { problems: [`${rule} moves classes between the groups that [ ] and | delimit`], notes: [] };
    return { problems: [], notes: beforeClasses.length === afterClasses.length ? [] : [`${rule} removes duplicate classes`] };
  }
  const lost = withoutItems(beforeClasses, new Set(afterClasses));
  const gained = withoutItems(afterClasses, new Set(beforeClasses));
  if (roles.removesDuplicateClasses?.has(rule) && gained.length === 0 && lost.every((className) => occursMoreThanOnce(source, className))) {
    return { problems: [], notes: [`${rule} removes duplicate classes`] };
  }
  const mayRewrite = roles.rewritesClasses?.has(rule) === true || (lost.length === gained.length && !regroups);
  if (mayRewrite) return { problems: [], notes: [`${rule} rewrites classes: ${lost.join(' ') || 'none'} became ${gained.join(' ') || 'none'}`] };
  return { problems: [`${rule} changes the classes: removes ${lost.join(' ') || 'none'}, adds ${gained.join(' ') || 'none'}`], notes: [] };
}

function lineBreakKindsIn(code: string): Set<string> {
  return new Set(code.match(lineBreak));
}

function describeAddedLineBreaks(source: string, fixed: string): FixProblem[] {
  const kindsInSource = lineBreakKindsIn(source);
  const allowedKinds = kindsInSource.size === 0 ? new Set(['\n']) : kindsInSource;
  const addedKinds = [...lineBreakKindsIn(fixed)].filter((kind) => !allowedKinds.has(kind));
  return addedKinds.map((kind) => ({ message: `the fix adds ${lineBreakNames[kind]} line breaks to a template that has none` }));
}

function collectOpenTags(value: unknown, tags: OpenTagRange[] = [], seen = new Set<object>()): OpenTagRange[] {
  if (typeof value !== 'object' || value === null || seen.has(value)) return tags;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child) => collectOpenTags(child, tags, seen));
    return tags;
  }
  const node = value as Record<string, { range?: Range } | unknown>;
  const openStart = (node['openStart'] as { range?: Range } | undefined)?.range;
  const openEnd = (node['openEnd'] as { range?: Range } | undefined)?.range;
  if (openStart && openEnd) tags.push({ start: openStart[0], attributesStart: openStart[1], closeBracketStart: openEnd[0] });
  for (const [key, child] of Object.entries(node)) {
    if (!keysOutsideTheHtmlTree.has(key)) collectOpenTags(child, tags, seen);
  }
  return tags;
}

function indentationOfLineAt(code: string, offset: number): string {
  const lineStart = code.lastIndexOf('\n', offset - 1) + 1;
  leadingIndentation.lastIndex = lineStart;
  return leadingIndentation.exec(code)?.[0] ?? '';
}

function lineStartsWithin(code: string, start: number, end: number): number[] {
  const lineStarts: number[] = [];
  for (let lineBreak = code.indexOf('\n', start); lineBreak !== -1 && lineBreak < end; lineBreak = code.indexOf('\n', lineBreak + 1)) {
    lineStarts.push(lineBreak + 1);
  }
  return lineStarts;
}

function isBlankLineAt(code: string, lineStart: number): boolean {
  const contentStart = lineStart + indentationOfLineAt(code, lineStart).length;
  return /^(\r?\n|$)/.test(code.slice(contentStart, contentStart + 2));
}

function countUnderIndentedTagLines(code: string, result: TwigParseResult): number {
  return collectOpenTags(result.ast.body).reduce((count, tag) => {
    const tagIndentation = indentationOfLineAt(code, tag.start);
    const tagLines = lineStartsWithin(code, tag.attributesStart, tag.closeBracketStart).filter((lineStart) => !isBlankLineAt(code, lineStart));
    const underIndentedLines = tagLines.filter((lineStart) => indentationOfLineAt(code, lineStart).length < tagIndentation.length);
    return count + underIndentedLines.length;
  }, 0);
}

function describeUnderIndentedTagLines(source: string, before: TwigParseResult, fixed: string, after: TwigParseResult): FixProblem[] {
  const added = countUnderIndentedTagLines(fixed, after) - countUnderIndentedTagLines(source, before);
  if (added <= 0) return [];
  return [{ message: `the fix leaves ${added} more lines of opening tags less indented than the tag line` }];
}

export function reviewFix(source: string, fixed: string, fixKeeps: FixKeeps, applied: readonly AppliedFix[] = [], roles: ClassRuleRoles = {}): FixReview {
  const before = parse(source);
  const after = parse(fixed);
  if ('error' in after) return { problems: [{ message: `the fixed template no longer parses: ${after.error}` }], notes: [] };
  if ('error' in before) return { problems: [], notes: [] };

  const problems: FixProblem[] = [...describeAddedLineBreaks(source, fixed), ...describeUnderIndentedTagLines(source, before.result, fixed, after.result)];
  if (after.result.services.twig.unconvertedBlocks.length !== before.result.services.twig.unconvertedBlocks.length) {
    problems.push({ message: 'the fix changes how many Twig blocks the parser can read' });
  }
  const blockChange = describeFirstDifference(twigBlockShapes(before.result), twigBlockShapes(after.result));
  if (blockChange) problems.push({ ...blockChange, message: `the fix changes the Twig blocks: ${blockChange.message}` });

  if (fixKeeps === 'layout') {
    const layoutChange = describeFirstDifference(layoutTokens(source, before.result), layoutTokens(fixed, after.result));
    if (layoutChange) problems.push({ ...layoutChange, message: `the fix changes more than the whitespace between tokens: ${layoutChange.message}` });
  }
  if (fixKeeps !== 'class-tokens') return { problems, notes: [] };

  const located = (fix: AppliedFix, message: string): FixProblem => {
    const offset = offsetOfAppliedFix(source, fix);
    return { message, ...(offset !== undefined && { offset }) };
  };
  const firstOfEachMessage = (found: readonly FixProblem[]) => [...new Map(found.map((problem) => [problem.message, problem])).values()];
  const reviews = applied.map((fix) => ({ fix, review: reviewClassListFix(fix, source, roles) }));
  return {
    problems: [...problems, ...firstOfEachMessage(reviews.flatMap(({ fix, review }) => review.problems.map((message) => located(fix, message))))],
    notes: firstOfEachMessage(reviews.flatMap(({ fix, review }) => review.notes.map((message) => located(fix, message)))),
  };
}
