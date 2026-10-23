import { HtmlSyntaxError, parseForESLint, TwigSyntaxError } from '../../src/index.js';
import { createOffsetLocator } from '../../src/source-text.js';
import { groupTwigBlocks, type TwigBlock } from '../../src/twig/blocks.js';
import { toSameLengthJavaScript } from '../../src/twig/javascript.js';
import { tokenizeTwig } from '../../src/twig/tokens.js';
import { branchSegmentsOf, isClosedInAnotherBranch, isInsideABranch, type BranchSegment } from './branches.js';

export type OutputIssue = { readonly check: string; readonly detail: string; readonly line?: number; readonly range?: readonly [number, number] };

export const templateDefectChecks: ReadonlySet<string> = new Set(['template is valid Twig and HTML', 'html: element closes', 'html: element left open in a Twig branch', 'html: stray close tag', 'html: element opened and closed in different Twig branches']);

type Node = {
  readonly type: string;
  readonly range: [number, number];
  readonly loc: { start: { line: number; column: number }; end: { line: number; column: number } };
  readonly [key: string]: unknown;
};
type Token = { readonly value: string; readonly range: [number, number] };
type Range = readonly [number, number];
type ReportIssue = (check: string, detail: string, where?: number | Range) => void;

const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function walk(value: unknown, visit: (node: Node, parent: Node | undefined) => void, parent?: Node, seen = new Set<object>()): void {
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child) => walk(child, visit, parent, seen));
    return;
  }
  const node = isNode(value) ? value : undefined;
  if (node) visit(node, parent);
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'parent' && key !== 'loc' && key !== 'range') walk(child, visit, node ?? parent, seen);
  }
}

function overlaps([start, end]: Range, ranges: readonly Range[]): boolean {
  return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && rangeStart < end);
}

type Attribute = {
  readonly range: [number, number];
  readonly key: Token & { readonly parts?: readonly { readonly type: string; readonly value: string }[] };
  readonly value?: Token;
  readonly startWrapper?: Token;
};
type ParsedTag = Node & {
  readonly name?: string;
  readonly openStart: Token;
  readonly close?: Token;
  readonly selfClosing?: boolean;
  readonly attributes?: readonly Attribute[];
  readonly children?: readonly Node[];
};

const keysOutsideTheHtmlTree = new Set(['parent', 'loc', 'range', 'parts', 'stylesheet']);
const closeTagPattern = /<\/\s*((?:\{\{.*?\}\}|[^\s>{])+)\s*>?/g;
const twigTagOrComment = /\{%|\{#/;

function collectHtmlLeaves(value: unknown, leaves: Node[] = [], seen = new Set<object>()): Node[] {
  if (typeof value !== 'object' || value === null || seen.has(value)) return leaves;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child) => collectHtmlLeaves(child, leaves, seen));
    return leaves;
  }
  if (isNode(value) && typeof value['value'] === 'string') leaves.push(value);
  for (const [key, child] of Object.entries(value)) {
    if (!keysOutsideTheHtmlTree.has(key)) collectHtmlLeaves(child, leaves, seen);
  }
  return leaves;
}

type TagNode = ParsedTag & { readonly name: string };

function isParsedTag(node: unknown): node is ParsedTag {
  return isNode(node) && 'openStart' in node && 'attributes' in node;
}

function withName(tag: ParsedTag): TagNode {
  return { ...tag, name: tag.name ?? tag.openStart.value.slice(1) };
}

function collectTags(body: unknown): TagNode[] {
  const tags: TagNode[] = [];
  walk(body, (node) => {
    if (isParsedTag(node)) tags.push(withName(node));
  });
  return tags;
}

function equalsSignRanges(tags: readonly TagNode[]): Range[] {
  return tags.flatMap((tag) => (tag.attributes ?? []).flatMap((attribute): Range[] => {
    const valueStart = (attribute.startWrapper ?? attribute.value)?.range[0];
    return valueStart === undefined ? [] : [[attribute.key.range[1], valueStart]];
  }));
}

function findUncoveredSource(code: string, coveredRanges: readonly Range[]): Range[] {
  const uncovered: Range[] = [];
  let position = 0;
  const addGap = (start: number, end: number) => {
    const gap = code.slice(start, end);
    const contentStart = gap.search(/\S/);
    if (contentStart === -1) return;
    uncovered.push([start + contentStart, start + gap.trimEnd().length]);
  };
  for (const [start, end] of [...coveredRanges].sort((first, second) => first[0] - second[0])) {
    if (start > position) addGap(position, start);
    position = Math.max(position, end);
  }
  addGap(position, code.length);
  return uncovered;
}

function comparableTagName(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase();
}

function hasUnclosedElementNamed(name: string, openedBefore: number, tags: readonly TagNode[]): boolean {
  return tags.some((tag) => !tag.close && !tag.selfClosing && tag.range[0] < openedBefore && comparableTagName(tag.name) === comparableTagName(name));
}

function isLeftOpen(tag: TagNode): boolean {
  return !tag.close && !tag.selfClosing && !voidElements.has(tag.name.toLowerCase());
}

function containsUnclosedElement(tag: TagNode): boolean {
  return (tag.children ?? []).some((child) => {
    if (!isParsedTag(child)) return false;
    const childTag = withName(child);
    return isLeftOpen(childTag) || containsUnclosedElement(childTag);
  });
}

function isTwigGluedToName(name: string): boolean {
  return twigTagOrComment.test(name) && /[\w-](?=\{[%#])|[%#]\}[\w-]/.test(name);
}

function checkTreeShape(tags: readonly TagNode[], report: ReportIssue): void {
  for (const tag of tags) {
    const children = tag.children ?? [];
    children.forEach((child, index) => {
      const previous = children[index - 1];
      if (previous && child.range[0] < previous.range[1]) report('html: siblings in source order', `${child.type} after ${previous.type} in <${tag.name}>`, child.range);
      if (child.range[0] < tag.range[0] || child.range[1] > tag.range[1]) report('html: child inside parent', `${child.type} outside <${tag.name}>`, child.range);
    });
    const attributes = tag.attributes ?? [];
    attributes.forEach((attribute, index) => {
      const previous = attributes[index - 1];
      if (previous && attribute.range[0] < previous.range[1]) report('html: siblings in source order', `attribute ${JSON.stringify(attribute.key.value).slice(0, 40)} in <${tag.name}>`, attribute.range);
    });
  }
}

function checkLeavesDoNotOverlap(leaves: readonly Node[], code: string, report: ReportIssue): void {
  const sorted = [...leaves].sort((first, second) => first.range[0] - second.range[0]);
  sorted.forEach((leaf, index) => {
    const previous = sorted[index - 1];
    if (!previous || leaf.range[0] >= previous.range[1]) return;
    report('html: nodes do not overlap', `${leaf.type} ${JSON.stringify(code.slice(...leaf.range)).slice(0, 40)} overlaps ${previous.type}`, leaf.range);
  });
}

function describeUncoveredSource(code: string, [start, end]: Range, tags: readonly TagNode[], branchSegments: readonly BranchSegment[]): OutputIssue[] {
  const text = code.slice(start, end);
  const issues: OutputIssue[] = [];
  let remainder = text;
  for (const match of text.matchAll(closeTagPattern)) {
    const [closeTag, name = ''] = match;
    const closeStart = start + match.index;
    const isDroppedClose = hasUnclosedElementNamed(name, closeStart, tags);
    const branchTags = tags.map((tag) => ({ name: tag.name, openStart: tag.range[0], isClosed: Boolean(tag.close || tag.selfClosing) }));
    const check = !isDroppedClose
      ? 'html: stray close tag'
      : isClosedInAnotherBranch(branchSegments, closeStart, name, branchTags) ? 'html: element opened and closed in different Twig branches' : 'html: close tag is read';
    issues.push({ check, detail: closeTag.slice(0, 60), range: [closeStart, closeStart + closeTag.length] });
    remainder = remainder.replace(closeTag, '');
  }
  if (/\S/.test(remainder)) issues.push({ check: 'html: source is covered', detail: JSON.stringify(remainder.trim()).slice(0, 60), range: [start, end] });
  return issues;
}

function verbatimDelimiterRanges(code: string, blocks: readonly TwigBlock[]): Range[] {
  const ranges: Range[] = [];
  let bodyStart: number | undefined;
  for (const block of blocks) {
    if (block.tagName === 'verbatim') bodyStart = block.end;
    if (block.tagName !== 'endverbatim' || bodyStart === undefined) continue;
    for (const delimiter of code.slice(bodyStart, block.start).matchAll(/\{\{|\}\}|\{%|%\}|\{#|#\}/g)) {
      ranges.push([bodyStart + delimiter.index, bodyStart + delimiter.index + 2]);
    }
    bodyStart = undefined;
  }
  return ranges;
}

function describeParseFailure(error: unknown): OutputIssue {
  if (error instanceof HtmlSyntaxError || error instanceof TwigSyntaxError) {
    return { check: 'template is valid Twig and HTML', detail: error.message, line: error.lineNumber };
  }
  return { check: 'parses', detail: error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error) };
}

const rawTextElements: ReadonlySet<string> = new Set(['script', 'style', 'textarea', 'title']);

function blankOut(text: string, start: number, end: number): string {
  return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
}

// Blanks comments and raw-text element content in one left-to-right pass, skipping over whole tags as HTML does.
function maskCommentsAndRawText(markup: string): string {
  const commentOrTag = /<!--|<([A-Za-z][\w:-]*)(?:=\s*"[^"]*"|=\s*'[^']*'|[^>])*(?:>|$)/g;
  let masked = markup;
  for (let match = commentOrTag.exec(masked); match; match = commentOrTag.exec(masked)) {
    const [opening, tagName] = match;
    const contentStart = match.index + opening.length;
    if (tagName === undefined) {
      const commentEnd = masked.indexOf('-->', contentStart);
      const end = commentEnd === -1 ? masked.length : commentEnd + '-->'.length;
      masked = blankOut(masked, match.index, end);
      commentOrTag.lastIndex = end;
      continue;
    }
    if (!rawTextElements.has(tagName.toLowerCase())) continue;
    const closeTag = masked.toLowerCase().indexOf(`</${tagName.toLowerCase()}`, contentStart);
    const end = closeTag === -1 ? masked.length : closeTag;
    masked = blankOut(masked, contentStart, end);
    commentOrTag.lastIndex = end;
  }
  return masked;
}

function findClassAttributesInMarkup(code: string, blocks: readonly TwigBlock[]): number[] {
  let masked = code;
  for (const block of blocks) {
    const startsTagName = /<\/?[\w:-]*$/.test(code.slice(Math.max(0, block.start - 40), block.start));
    masked = masked.slice(0, block.start) + (startsTagName ? 'x' : ' ').repeat(block.end - block.start) + masked.slice(block.end);
  }
  masked = maskCommentsAndRawText(masked);
  const offsets: number[] = [];
  for (const tag of masked.matchAll(/<([A-Za-z][\w:-]*)((?:=\s*"[^"]*"|=\s*'[^']*'|[^>])*)(?:>|$)/g)) {
    const [, name = '', head = ''] = tag;
    const headStart = tag.index + 1 + name.length;
    for (const attribute of head.matchAll(/(^|\s)class\s*=/gi)) offsets.push(headStart + attribute.index + (attribute[1]?.length ?? 0));
  }
  return offsets;
}

export type ParseForOutputChecks = (code: string, options: { readonly ignoreInterpolatedAttributes: readonly string[] }) => ReturnType<typeof parseForESLint>;

export function checkParserOutput(code: string, parse: ParseForOutputChecks = parseForESLint): OutputIssue[] {
  const issues: OutputIssue[] = [];

  let result: ReturnType<typeof parseForESLint>;
  try {
    result = parse(code, { ignoreInterpolatedAttributes: ['class'] });
  } catch (error) {
    return [describeParseFailure(error)];
  }

  const locate = createOffsetLocator(code);
  const lineOf = (offset: number) => locate(offset).line;
  const report = (check: string, detail: string, where?: number | Range) => {
    if (where === undefined) return issues.push({ check, detail });
    if (typeof where === 'number') return issues.push({ check, detail, line: where });
    return issues.push({ check, detail, line: lineOf(where[0]), range: where });
  };
  const hasSameLoc = (node: Node) => {
    const start = locate(node.range[0]);
    const end = locate(node.range[1]);
    return node.loc.start.line === start.line && node.loc.start.column === start.column && node.loc.end.line === end.line && node.loc.end.column === end.column;
  };
  const isRangeInSource = (node: Node) => Array.isArray(node.range) && node.range[0] >= 0 && node.range[1] <= code.length && node.range[0] <= node.range[1];

  const allBlocks = groupTwigBlocks(tokenizeTwig(code));
  const expressionBlocks = allBlocks.filter((block) => block.kind !== 'comment');
  const services = result.services.twig;
  const unparsedBlocks = services.diagnostics.filter((diagnostic) => diagnostic.code === 'x-unparsed-twig');
  for (const block of unparsedBlocks) report('converts every Twig block', `${code.slice(...block.range)} (${block.message})`, [block.range[0], block.range[1]]);
  const convertedRanges: Range[] = expressionBlocks
    .filter((block) => toSameLengthJavaScript(block) !== undefined && !unparsedBlocks.some((unparsed) => unparsed.range[0] === block.start))
    .map((block) => [block.start, block.end]);

  const stringCountByStart = new Map<number, number>();
  walk(result.ast.twigBody, (node, parent) => {
    if (!isRangeInSource(node)) return report('twig: range inside the source', `${node.type} ${JSON.stringify(node.range)}`);
    const source = code.slice(...node.range);
    if (!hasSameLoc(node)) report('twig: loc matches range', `${node.type} "${source.slice(0, 40)}"`, node.range);
    if (parent && (node.range[0] < parent.range[0] || node.range[1] > parent.range[1])) report('twig: child inside parent', `${node.type} "${source.slice(0, 40)}" in ${parent.type}`, node.range);
    if (!parent && !convertedRanges.some(([start, end]) => node.range[0] >= start && node.range[1] <= end)) report('twig: statement inside its block', `${node.type} "${source.slice(0, 40)}"`, node.range);
    if (node.type === 'Identifier' && source !== node['name']) {
      const name = String(node['name']);
      const isRenamedReservedWord = name.length === source.length && name.startsWith('_') && source.slice(1).replace(/[^A-Za-z0-9_]/g, '_') === name.slice(1);
      if (!isRenamedReservedWord) report('twig: identifier matches source', `"${name}" vs "${source}"`, node.range);
    }
    if (node.type === 'Literal' && source !== node['raw']) report('twig: literal matches source', `${JSON.stringify(node['raw'])} vs ${JSON.stringify(source)}`, node.range);
    const isString = node.type === 'TemplateLiteral' || (node.type === 'Literal' && typeof node['value'] === 'string');
    if (isString) stringCountByStart.set(node.range[0], (stringCountByStart.get(node.range[0]) ?? 0) + 1);
    if (node.type === 'TemplateLiteral' && (!/^['"]/.test(source) || source.at(-1) !== source[0])) report('twig: string range on its Twig quotes', source.slice(0, 60), node.range);
    if (node.type === 'TemplateElement') {
      const inner = code.slice(node.range[0] + 1, node.range[1] - (node['tail'] ? 1 : 2));
      const raw = (node['value'] as { raw: string }).raw;
      if (inner !== raw) report('twig: string text matches source', `${JSON.stringify(raw).slice(0, 50)} vs ${JSON.stringify(inner).slice(0, 50)}`, node.range);
    }
  });
  for (const block of expressionBlocks) {
    if (!convertedRanges.some(([start]) => start === block.start)) continue;
    for (const token of block.tokens) {
      if (token.type !== 'OPENING_QUOTE') continue;
      const count = stringCountByStart.get(token.start) ?? 0;
      if (count !== 1) report('twig: every string appears once', `${count} times: ${code.slice(token.start, token.start + 50).split('\n')[0]}`, [token.start, token.end]);
    }
  }

  const commentRanges: Range[] = allBlocks.filter((block) => block.kind === 'comment').map((block) => [block.start, block.end]);
  const branchSegments = branchSegmentsOf(code);
  const tags = collectTags(result.ast.body);
  walk(result.ast.body, (node) => {
    if (!isRangeInSource(node)) return report('html: range inside the source', `${node.type} ${JSON.stringify(node.range)}`);
    const source = code.slice(...node.range);
    if (!hasSameLoc(node)) report('html: loc matches range', `${node.type} "${source.slice(0, 40)}"`, node.range);
    const value = node['value'];
    if (typeof value === 'string' && value !== source && !node.type.startsWith('Css') && !overlaps(node.range, commentRanges)) {
      report('html: node text matches source', `${node.type} ${JSON.stringify(source).slice(0, 50)} read as ${JSON.stringify(value).slice(0, 50)}`, node.range);
    }
  });
  const classAttributesRead = services.omittedAttributes.filter((attribute) => attribute.name.toLowerCase() === 'class').map((attribute) => attribute.range[0]);
  for (const tag of tags) {
    if (isLeftOpen(tag) && !containsUnclosedElement(tag)) {
      const closeCheck = isInsideABranch(tag.range[0], branchSegments) ? 'html: element left open in a Twig branch' : 'html: element closes';
      report(closeCheck, `line ${tag.loc.start.line}: ${code.slice(...tag.openStart.range).slice(0, 60)}`, tag.openStart.range);
    }
    if (tag.type !== 'Tag') continue;
    for (const part of ['openStart', 'openEnd', 'close'] as const) {
      const token = tag[part] as Token | undefined;
      if (token && code.slice(...token.range) !== token.value) report('html: tag parts match source', `${part} ${JSON.stringify(token.value).slice(0, 40)}`, token.range);
    }
    const openStartAfterName = code.slice(tag.openStart.range[0] + 1, tag.openStart.range[1]).toLowerCase().slice(tag.name.length);
    if (!code.slice(tag.openStart.range[0] + 1).toLowerCase().startsWith(tag.name.toLowerCase()) || !/^(\{|$)/.test(openStartAfterName)) report('html: tag name matches source', `${tag.name} vs ${code.slice(...tag.openStart.range)}`, tag.openStart.range);
    if (isTwigGluedToName(tag.name)) report('html: Twig block glued to a name', `<${tag.name.slice(0, 60)}`, tag.openStart.range);
    for (const attribute of tag.attributes ?? []) {
      if (code.slice(...attribute.key.range) !== attribute.key.value) report('html: attribute name matches source', JSON.stringify(attribute.key.value).slice(0, 40), attribute.key.range);
      if (isTwigGluedToName(attribute.key.value)) report('html: Twig block glued to a name', JSON.stringify(attribute.key.value).slice(0, 60), attribute.key.range);
      if (attribute.key.value.toLowerCase() === 'class') classAttributesRead.push(attribute.key.range[0]);
    }
  }
  const classAttributesInMarkup = findClassAttributesInMarkup(code, allBlocks);
  if (classAttributesRead.length !== classAttributesInMarkup.length) {
    const firstMissed = classAttributesInMarkup.find((offset) => !classAttributesRead.includes(offset)) ?? classAttributesRead.find((offset) => !classAttributesInMarkup.includes(offset));
    const where = firstMissed === undefined ? undefined : ([firstMissed, firstMissed + 'class'.length] as const);
    report('html: every class attribute is read', `found ${classAttributesRead.length}, markup has ${classAttributesInMarkup.length}`, where);
  }

  checkTreeShape(tags, report);
  const leaves = collectHtmlLeaves(result.ast.body);
  checkLeavesDoNotOverlap(leaves, code, report);
  const coveredRanges = [...leaves.map((leaf) => leaf.range), ...equalsSignRanges(tags), ...services.omittedAttributes.map((attribute) => attribute.range), ...commentRanges, ...verbatimDelimiterRanges(code, allBlocks)];
  for (const range of findUncoveredSource(code, coveredRanges)) {
    for (const issue of describeUncoveredSource(code, range, tags, branchSegments)) report(issue.check, issue.detail, issue.range ?? range);
  }

  return issues;
}
