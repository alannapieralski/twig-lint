import { drupalVoidElements } from '../../src/drupal.js';
import { branchSegmentsOf, isClosedInAnotherBranch } from './branches.js';
import { TokenizerMode, type Token } from 'parse5';
import { SAXParser, type EndTag, type StartTag } from 'parse5-sax-parser';
import type { Golden } from '../lexer/parity.js';
import type { OutputIssue } from './output-checks.js';

export type TwigRange = { readonly start: number; readonly end: number; readonly kind: 'print' | 'tag' | 'comment' };

type Range = readonly [number, number];
type GoldenToken = Golden['tokens'][number];
type OpenBlock = { readonly kind: 'print' | 'tag'; readonly start: number };

type Mode =
  | 'data'
  | 'tag-open'
  | 'end-tag-open'
  | 'tag-name'
  | 'before-attribute-name'
  | 'attribute-name'
  | 'after-attribute-name'
  | 'before-attribute-value'
  | 'attribute-value-double'
  | 'attribute-value-single'
  | 'attribute-value-unquoted'
  | 'after-attribute-value'
  | 'self-closing';
type ScanState = { readonly mode: Mode; readonly tagName: string; readonly isEndTag: boolean; readonly foreignDepth: number };
type Filler = 'name' | 'blank';

type OracleAttribute = { readonly name: string; readonly nameRange: Range; readonly valueRange: Range | undefined };
type OracleStartTag = { readonly name: string; readonly pairingName: string; readonly range: Range; readonly nameEnd: number; readonly attributes: readonly OracleAttribute[] };
type OracleEndTag = { readonly name: string; readonly pairingName: string; readonly range: Range };
type OracleEvent =
  | { readonly kind: 'start'; readonly tag: OracleStartTag; readonly selfClosing: boolean }
  | { readonly kind: 'end'; readonly tag: OracleEndTag }
  | { readonly kind: 'text' };
type EndTagKind = 'closes-current' | 'closes-after-implied-ends' | 'unmatched';
type OracleDocument = {
  readonly startTags: readonly OracleStartTag[];
  readonly endTags: readonly OracleEndTag[];
  readonly endTagKinds: ReadonlyMap<number, EndTagKind>;
  readonly parentStarts: ReadonlyMap<number, number | undefined>;
  readonly rawTextRegions: readonly Range[];
};

type OurAttribute = { readonly key: Range; readonly value: Range | undefined };
type OurTag = { readonly name: string; readonly range: Range; readonly parentStart: number | undefined; readonly openStart: Range; readonly openEnd: Range; readonly close: Range | undefined; readonly attributes: readonly OurAttribute[] };

type Report = (check: string, range: Range, message: string) => void;
type OpenElement = { readonly pairingName: string; readonly start: number };
type SaxLocation = { readonly startOffset: number; readonly endOffset: number; readonly attrs?: Record<string, { readonly startOffset: number }> };

const tagModes = new Set<Mode>(['tag-name', 'before-attribute-name', 'attribute-name', 'after-attribute-name', 'before-attribute-value', 'attribute-value-unquoted', 'after-attribute-value', 'self-closing']);
const endDelimiterByKind = { print: '}}', tag: '%}' } as const;
const rawTagInGap = /^\{%[-~]?\s*(?:verbatim|endverbatim|raw|endraw|line\s+\d+)\s*[-~]?%\}/;
const rawTextElements = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'image', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', ...drupalVoidElements]);
const specialElements = new Set(`address applet area article aside base basefont bgsound blockquote body br button caption center col colgroup dd
  details dir div dl dt embed fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html iframe img input
  keygen li link listing main marquee menu meta nav noembed noframes noscript object ol p param plaintext pre script search section select source
  style summary table tbody td template textarea tfoot th thead title tr track ul wbr xmp`.split(/\s+/));
const endTagChecks: Record<EndTagKind, string> = { 'closes-current': 'end tags', 'closes-after-implied-ends': 'implied end tags', 'unmatched': 'unmatched end tags' };
export const branchPairedEndTagCheck = 'html-oracle: element opened and closed in different Twig branches';
const foreignRoots = new Set(['svg', 'math']);
const htmlWhitespace = /[\t\n\f\r ]/;
const maxIssuesPerTemplate = 20;
const maxExcerptLength = 60;

function utf16IndexByByteOffset(source: string): Map<number, number> {
  const indexByByteOffset = new Map<number, number>();
  let byteOffset = 0;
  let utf16Index = 0;
  for (const character of source) {
    indexByByteOffset.set(byteOffset, utf16Index);
    byteOffset += Buffer.byteLength(character);
    utf16Index += character.length;
  }
  indexByByteOffset.set(byteOffset, utf16Index);
  return indexByByteOffset;
}

function describeToken(token: GoldenToken): string {
  return `Twig ${token.type} at line ${token.line}, byte offset ${token.offset}`;
}

function endOfDelimiter(source: string, offset: number, delimiter: string, token: GoldenToken): number {
  const trimmed = source[offset] === '-' || source[offset] === '~' ? offset + 1 : offset;
  if (!source.startsWith(delimiter, trimmed)) throw new Error(`Expected "${delimiter}" for the ${describeToken(token)}.`);
  return trimmed + delimiter.length;
}

// Matches a normalised Twig text value against the raw source, where "\n" may stand for "\r\n" or "\r".
function endOfText(source: string, start: number, value: string, token: GoldenToken): number {
  let index = start;
  for (const character of value) {
    if (character === '\n' && source[index] === '\r') {
      index += source[index + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (!source.startsWith(character, index)) throw new Error(`The ${describeToken(token)} does not match the source.`);
    index += character.length;
  }
  return index;
}

function rangesInGap(source: string, gapStart: number, gapEnd: number): TwigRange[] {
  const ranges: TwigRange[] = [];
  let index = gapStart;
  while (index < gapEnd) {
    if (htmlWhitespace.test(source[index] ?? '')) {
      index += 1;
      continue;
    }
    const rest = source.slice(index, gapEnd);
    if (rest.startsWith('{#')) {
      const close = rest.indexOf('#}', 2);
      if (close === -1) throw new Error(`Unterminated Twig comment at offset ${index}.`);
      ranges.push({ start: index, end: index + close + 2, kind: 'comment' });
      index += close + 2;
      continue;
    }
    const rawTag = rawTagInGap.exec(rest);
    if (!rawTag) throw new Error(`Twig emitted no token for ${JSON.stringify(rest.slice(0, 40))} at offset ${index}.`);
    ranges.push({ start: index, end: index + rawTag[0].length, kind: 'tag' });
    index += rawTag[0].length;
  }
  return ranges;
}

export function twigRangesFromOracle(source: string, golden: Golden): TwigRange[] {
  const toUtf16 = utf16IndexByByteOffset(source);
  const blocks: TwigRange[] = [];
  const covered: Range[] = [];
  let open: OpenBlock | undefined;

  for (const token of golden.tokens) {
    const offset = toUtf16.get(token.offset);
    if (offset === undefined) throw new Error(`The ${describeToken(token)} is not on a character boundary.`);

    if (token.type === 'begin of print statement' || token.type === 'begin of statement block') {
      if (open) throw new Error(`The ${describeToken(token)} opens inside another block.`);
      open = { kind: token.type === 'begin of print statement' ? 'print' : 'tag', start: offset };
      continue;
    }
    if (token.type === 'end of print statement' || token.type === 'end of statement block') {
      const kind = token.type === 'end of print statement' ? 'print' : 'tag';
      if (open?.kind !== kind) throw new Error(`The ${describeToken(token)} closes no open ${kind} block.`);
      const block: TwigRange = { start: open.start, end: endOfDelimiter(source, offset, endDelimiterByKind[kind], token), kind };
      blocks.push(block);
      covered.push([block.start, block.end]);
      open = undefined;
      continue;
    }
    if (token.type === 'text') {
      if (open) throw new Error(`The ${describeToken(token)} is inside a block.`);
      covered.push([offset, endOfText(source, offset, String(token.value), token)]);
      continue;
    }
    if (token.type === 'end of template') {
      if (open) throw new Error(`The ${describeToken(token)} leaves a block open.`);
      continue;
    }
    if (!open) throw new Error(`The ${describeToken(token)} is outside any block.`);
  }

  const gapRanges: TwigRange[] = [];
  let cursor = 0;
  for (const [start, end] of covered) {
    if (start < cursor) throw new Error(`Twig tokens overlap at offset ${start}.`);
    gapRanges.push(...rangesInGap(source, cursor, start));
    cursor = end;
  }
  gapRanges.push(...rangesInGap(source, cursor, source.length));

  return [...blocks, ...gapRanges].sort((first, second) => first.start - second.start);
}

function assertSortedAndDisjoint(source: string, twigRanges: readonly TwigRange[]): void {
  twigRanges.reduce((previousEnd, range) => {
    if (range.start < previousEnd || range.end < range.start || range.end > source.length) {
      throw new Error(`Twig ranges must be sorted, disjoint and inside the source: [${range.start}, ${range.end}).`);
    }
    return range.end;
  }, 0);
}

function blankTwigRanges(source: string, twigRanges: readonly TwigRange[]): string {
  const characters = source.split('');
  for (const range of twigRanges) {
    for (let index = range.start; index < range.end; index += 1) {
      if (characters[index] !== '\n' && characters[index] !== '\r') characters[index] = ' ';
    }
  }
  return characters.join('');
}

function startsAttributeName(character: string | undefined): boolean {
  return character !== undefined && !htmlWhitespace.test(character) && character !== '/' && character !== '>' && character !== '{';
}

function fillerFor(state: ScanState, range: TwigRange, source: string): Filler {
  if (range.kind !== 'print') return 'blank';
  switch (state.mode) {
    case 'attribute-name':
    case 'tag-open':
    case 'end-tag-open':
    case 'before-attribute-value':
    case 'attribute-value-double':
    case 'attribute-value-single':
    case 'attribute-value-unquoted':
      return 'name';
    case 'before-attribute-name':
    case 'after-attribute-name':
    case 'after-attribute-value':
    case 'self-closing':
      return startsAttributeName(source[range.end]) ? 'name' : 'blank';
    default:
      return 'blank';
  }
}

function startTagState(state: ScanState, character: string): ScanState {
  return { ...state, mode: 'tag-name', tagName: character.toLowerCase() };
}

function nextState(state: ScanState, character: string): ScanState {
  const isWhitespace = htmlWhitespace.test(character);
  const isLetter = /[A-Za-z]/.test(character);
  switch (state.mode) {
    case 'data':
      return character === '<' ? { ...state, mode: 'tag-open', isEndTag: false } : state;
    case 'tag-open':
      if (character === '/') return { ...state, mode: 'end-tag-open', isEndTag: true };
      if (isLetter) return startTagState(state, character);
      return nextState({ ...state, mode: 'data' }, character);
    case 'end-tag-open':
      return isLetter ? startTagState(state, character) : { ...state, mode: 'data' };
    case 'tag-name':
      if (isWhitespace) return { ...state, mode: 'before-attribute-name' };
      if (character === '/') return { ...state, mode: 'self-closing' };
      if (character === '>') return { ...state, mode: 'data' };
      return { ...state, tagName: state.tagName + character.toLowerCase() };
    case 'before-attribute-name':
    case 'after-attribute-value':
    case 'self-closing':
      if (isWhitespace) return { ...state, mode: 'before-attribute-name' };
      if (character === '/') return { ...state, mode: 'self-closing' };
      if (character === '>') return { ...state, mode: 'data' };
      return { ...state, mode: 'attribute-name' };
    case 'attribute-name':
      if (isWhitespace) return { ...state, mode: 'after-attribute-name' };
      if (character === '/') return { ...state, mode: 'self-closing' };
      if (character === '>') return { ...state, mode: 'data' };
      return character === '=' ? { ...state, mode: 'before-attribute-value' } : state;
    case 'after-attribute-name':
      if (isWhitespace) return state;
      if (character === '/') return { ...state, mode: 'self-closing' };
      if (character === '>') return { ...state, mode: 'data' };
      return character === '=' ? { ...state, mode: 'before-attribute-value' } : { ...state, mode: 'attribute-name' };
    case 'before-attribute-value':
      if (isWhitespace) return state;
      if (character === '"') return { ...state, mode: 'attribute-value-double' };
      if (character === "'") return { ...state, mode: 'attribute-value-single' };
      if (character === '>') return { ...state, mode: 'data' };
      return { ...state, mode: 'attribute-value-unquoted' };
    case 'attribute-value-double':
      return character === '"' ? { ...state, mode: 'after-attribute-value' } : state;
    case 'attribute-value-single':
      return character === "'" ? { ...state, mode: 'after-attribute-value' } : state;
    case 'attribute-value-unquoted':
      if (isWhitespace) return { ...state, mode: 'before-attribute-name' };
      return character === '>' ? { ...state, mode: 'data' } : state;
  }
}

function endOfOpaqueMarkup(blanked: string, index: number): number | undefined {
  if (blanked.startsWith('<!-->', index)) return index + 5;
  if (blanked.startsWith('<!--->', index)) return index + 6;
  if (blanked.startsWith('<!--', index)) {
    const close = blanked.indexOf('-->', index + 4);
    return close === -1 ? blanked.length : close + 3;
  }
  if (!blanked.startsWith('<!', index) && !blanked.startsWith('<?', index)) return undefined;
  const close = blanked.indexOf('>', index + 2);
  return close === -1 ? blanked.length : close + 1;
}

function endOfRawText(blanked: string, index: number, tagName: string): number {
  if (tagName === 'plaintext') return blanked.length;
  const closing = new RegExp(`</${tagName}[\\t\\n\\f\\r />]`, 'ig');
  closing.lastIndex = index;
  return closing.exec(blanked)?.index ?? blanked.length;
}

function stateAfterTagEnds(previous: ScanState, emitted: ScanState): ScanState {
  if (!foreignRoots.has(previous.tagName)) return emitted;
  if (previous.isEndTag) return { ...emitted, foreignDepth: Math.max(0, emitted.foreignDepth - 1) };
  return previous.mode === 'self-closing' ? emitted : { ...emitted, foreignDepth: emitted.foreignDepth + 1 };
}

function isRawTextStart(previous: ScanState, emitted: ScanState): boolean {
  return !previous.isEndTag && emitted.foreignDepth === 0 && previous.mode !== 'self-closing' && rawTextElements.has(previous.tagName);
}

function maskTwig(source: string, twigRanges: readonly TwigRange[]): string {
  const blanked = blankTwigRanges(source, twigRanges);
  const characters = blanked.split('');
  const rangesByStart = new Map(twigRanges.map((range) => [range.start, range]));
  let state: ScanState = { mode: 'data', tagName: '', isEndTag: false, foreignDepth: 0 };
  let index = 0;

  while (index < characters.length) {
    const range = rangesByStart.get(index);
    if (range && fillerFor(state, range, source) === 'name') characters.fill('x', range.start, range.end);

    const opaqueEnd = state.mode === 'data' && characters[index] === '<' ? endOfOpaqueMarkup(blanked, index) : undefined;
    if (opaqueEnd !== undefined) {
      index = opaqueEnd;
      continue;
    }

    const character = characters[index] ?? '';
    const previous = state;
    state = nextState(state, character);
    index += 1;
    if (character !== '>' || state.mode !== 'data' || !tagModes.has(previous.mode)) continue;

    const emitted = stateAfterTagEnds(previous, state);
    state = emitted;
    if (isRawTextStart(previous, emitted)) index = endOfRawText(blanked, index, previous.tagName);
  }
  return characters.join('');
}

class ScriptingDisabledSaxParser extends SAXParser {
  tokenize(html: string): void {
    this.tokenizer.write(html, true);
  }

  override onStartTag(token: Token.TagToken): void {
    super.onStartTag(token);
    if (token.tagName === 'noscript') this.tokenizer.state = TokenizerMode.DATA;
  }
}

function locationOf(token: StartTag | EndTag): SaxLocation {
  const location = token.sourceCodeLocation as SaxLocation | null | undefined;
  if (!location) throw new Error('parse5 returned a token without a source location.');
  return location;
}

function skipWhitespace(text: string, index: number): number {
  let cursor = index;
  while (htmlWhitespace.test(text[cursor] ?? '')) cursor += 1;
  return cursor;
}

function valueRangeAfterName(masked: string, nameEnd: number): Range | undefined {
  const equals = skipWhitespace(masked, nameEnd);
  if (masked[equals] !== '=') return undefined;
  const valueStart = skipWhitespace(masked, equals + 1);
  const quote = masked[valueStart];
  if (quote === '"' || quote === "'") {
    const close = masked.indexOf(quote, valueStart + 1);
    return [valueStart + 1, close === -1 ? masked.length : close];
  }
  let valueEnd = valueStart;
  while (valueEnd < masked.length && !htmlWhitespace.test(masked[valueEnd] ?? '') && masked[valueEnd] !== '>') valueEnd += 1;
  return [valueStart, valueEnd];
}

function tagNameEnd(masked: string, nameStart: number): number {
  return nameStart + (/^[^\t\n\f\r />]*/.exec(masked.slice(nameStart))?.[0].length ?? 0);
}

function openTagStartEnd(source: string, nameEnd: number, twigRanges: readonly TwigRange[]): number {
  let end = nameEnd;
  for (;;) {
    const gluedTwig = twigRanges.find((range) => range.start === end);
    if (gluedTwig) end = gluedTwig.end;
    else if (end > nameEnd && /[^\s/>]/.test(source[end] ?? '>')) end += 1;
    else return end;
  }
}

function pairingNameOf(source: string, nameStart: number, nameEnd: number): string {
  return source.slice(nameStart, nameEnd).replace(/\s+/g, '').toLowerCase();
}

function toOracleStartTag(token: StartTag, source: string, masked: string): OracleStartTag {
  const location = locationOf(token);
  const nameEnd = tagNameEnd(masked, location.startOffset + 1);
  const attributes = Object.entries(location.attrs ?? {}).map(([name, attributeLocation]): OracleAttribute => {
    const nameRange: Range = [attributeLocation.startOffset, attributeLocation.startOffset + name.length];
    return { name, nameRange, valueRange: valueRangeAfterName(masked, nameRange[1]) };
  });
  return { name: token.tagName, pairingName: pairingNameOf(source, location.startOffset + 1, nameEnd), range: [location.startOffset, location.endOffset], nameEnd, attributes };
}

function toOracleEndTag(token: EndTag, source: string, masked: string): OracleEndTag {
  const location = locationOf(token);
  const nameStart = location.startOffset + 2;
  return { name: token.tagName, pairingName: pairingNameOf(source, nameStart, tagNameEnd(masked, nameStart)), range: [location.startOffset, location.endOffset] };
}

function collectOracleEvents(source: string, masked: string): OracleEvent[] {
  const events: OracleEvent[] = [];
  const parser = new ScriptingDisabledSaxParser({ sourceCodeLocationInfo: true });
  parser.on('startTag', (token: StartTag) => events.push({ kind: 'start', tag: toOracleStartTag(token, source, masked), selfClosing: token.selfClosing }));
  parser.on('endTag', (token: EndTag) => events.push({ kind: 'end', tag: toOracleEndTag(token, source, masked) }));
  parser.on('text', () => events.push({ kind: 'text' }));
  parser.tokenize(masked);
  return events;
}

function findRawTextRegions(events: readonly OracleEvent[], sourceLength: number): Range[] {
  return events.flatMap((event, index): Range[] => {
    if (event.kind !== 'start' || event.selfClosing || !rawTextElements.has(event.tag.name)) return [];
    const following = events.slice(index + 1).find((candidate) => candidate.kind !== 'text');
    if (following?.kind === 'start') return [];
    return [[event.tag.range[1], following?.kind === 'end' ? following.tag.range[0] : sourceLength]];
  });
}

function indexOfOpenElement(openElements: readonly OpenElement[], pairingName: string): number {
  for (let index = openElements.length - 1; index >= 0; index -= 1) {
    const name = openElements[index]?.pairingName ?? '';
    if (name === pairingName) return index;
    if (specialElements.has(name)) return -1;
  }
  return -1;
}

// Walks a browser-like open-element stack, recording each end tag's kind and each start tag's parent.
function walkOpenElements(events: readonly OracleEvent[]): { readonly endTagKinds: Map<number, EndTagKind>; readonly parentStarts: Map<number, number | undefined> } {
  const endTagKinds = new Map<number, EndTagKind>();
  const parentStarts = new Map<number, number | undefined>();
  const openElements: OpenElement[] = [];
  for (const event of events) {
    if (event.kind === 'start') {
      parentStarts.set(event.tag.range[0], openElements.at(-1)?.start);
      if (!event.selfClosing && !voidElements.has(event.tag.name)) openElements.push({ pairingName: event.tag.pairingName, start: event.tag.range[0] });
    }
    if (event.kind !== 'end') continue;
    const openIndex = indexOfOpenElement(openElements, event.tag.pairingName);
    if (openIndex === -1) {
      endTagKinds.set(event.tag.range[0], 'unmatched');
      continue;
    }
    endTagKinds.set(event.tag.range[0], openIndex === openElements.length - 1 ? 'closes-current' : 'closes-after-implied-ends');
    openElements.length = openIndex;
  }
  return { endTagKinds, parentStarts };
}

function readOracleDocument(source: string, masked: string): OracleDocument {
  const events = collectOracleEvents(source, masked);
  return {
    startTags: events.flatMap((event) => (event.kind === 'start' ? [event.tag] : [])),
    endTags: events.flatMap((event) => (event.kind === 'end' ? [event.tag] : [])),
    ...walkOpenElements(events),
    rawTextRegions: findRawTextRegions(events, masked.length),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readRange(value: unknown, description: string): Range {
  const range = isRecord(value) ? value['range'] : undefined;
  if (!Array.isArray(range) || typeof range[0] !== 'number' || typeof range[1] !== 'number') throw new Error(`Expected a ranged ${description} in the parser output.`);
  return [range[0], range[1]];
}

function readOptionalRange(value: unknown, description: string): Range | undefined {
  return value === undefined || value === null ? undefined : readRange(value, description);
}

function readOurTag(node: Record<string, unknown>, parentStart: number | undefined): OurTag {
  const attributes = Array.isArray(node['attributes']) ? node['attributes'] : [];
  return {
    name: typeof node['name'] === 'string' ? node['name'] : String(node['type']).replace(/Tag$/, '').toLowerCase(),
    range: readRange(node, 'tag'),
    parentStart,
    openStart: readRange(node['openStart'], 'openStart'),
    openEnd: readRange(node['openEnd'], 'openEnd'),
    close: readOptionalRange(node['close'], 'close'),
    attributes: attributes.map((attribute: unknown) => ({
      key: readRange(isRecord(attribute) ? attribute['key'] : undefined, 'attribute key'),
      value: readOptionalRange(isRecord(attribute) ? attribute['value'] : undefined, 'attribute value'),
    })),
  };
}

function collectOurTags(ast: unknown): OurTag[] {
  const tags: OurTag[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown, parentStart: number | undefined): void => {
    if (!isRecord(value) || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, parentStart));
      return;
    }
    const isTag = value['type'] === 'Tag' || value['type'] === 'ScriptTag' || value['type'] === 'StyleTag';
    const tag = isTag ? readOurTag(value, parentStart) : undefined;
    if (tag) tags.push(tag);
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'parent' && key !== 'loc' && key !== 'range' && key !== 'tokens' && key !== 'comments') visit(child, tag ? tag.openStart[0] : parentStart);
    }
  };
  visit(ast, undefined);
  return tags.sort((first, second) => first.openStart[0] - second.openStart[0]);
}

function rangesEqual(first: Range | undefined, second: Range | undefined): boolean {
  return first?.[0] === second?.[0] && first?.[1] === second?.[1];
}

function overlapsRange([start, end]: Range, [otherStart, otherEnd]: Range): boolean {
  return start < otherEnd && otherStart < end;
}

function containsOffset([start, end]: Range, offset: number): boolean {
  return start <= offset && offset < end;
}

function twigRangesInside(range: Range, twigRanges: readonly TwigRange[]): TwigRange[] {
  return twigRanges.filter((twigRange) => range[0] <= twigRange.start && twigRange.end <= range[1]);
}

function isTwigOnly(source: string, range: Range, twigRanges: readonly TwigRange[]): boolean {
  const inside = twigRangesInside(range, twigRanges);
  const remainder = inside.reduceRight((text, twigRange) => text.slice(0, twigRange.start - range[0]) + text.slice(twigRange.end - range[0]), source.slice(...range));
  return inside.length > 0 && remainder.trim() === '';
}

function gluesTwigTagToOtherContent(range: Range, twigRanges: readonly TwigRange[]): boolean {
  return twigRangesInside(range, twigRanges).some((twigRange) => twigRange.kind !== 'print' && (twigRange.start !== range[0] || twigRange.end !== range[1]));
}

function createLineLocator(source: string): (offset: number) => number {
  const lineStarts = [0, ...[...source.matchAll(/\r\n?|\n/g)].map((match) => match.index + match[0].length)];
  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((lineStarts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

function excerpt(source: string, [start, end]: Range): string {
  const text = source.slice(start, Math.min(end, start + maxExcerptLength * 2)).replace(/\s+/g, ' ').trim();
  return text.length > maxExcerptLength ? `${text.slice(0, maxExcerptLength - 3)}...` : text;
}

function describeRange(range: Range | undefined): string {
  return range ? `[${range[0]}, ${range[1]})` : 'none';
}

function compareAttributes(
  source: string,
  twigRanges: readonly TwigRange[],
  masked: string,
  oracleTag: OracleStartTag,
  ourTag: OurTag,
  report: Report,
): void {
  const matchedKeys = new Set<OurAttribute>();
  for (const oracleAttribute of oracleTag.attributes) {
    const candidates = ourTag.attributes.filter((attribute) => overlapsRange(attribute.key, oracleAttribute.nameRange));
    candidates.forEach((candidate) => matchedKeys.add(candidate));
    const exact = candidates.find((candidate) => rangesEqual(candidate.key, oracleAttribute.nameRange));
    if (candidates.length === 0) {
      report('attributes', oracleAttribute.nameRange, `missing attribute ${oracleAttribute.name}`);
      continue;
    }
    if (!exact) {
      const keysRange: Range = [Math.min(...candidates.map((candidate) => candidate.key[0])), Math.max(...candidates.map((candidate) => candidate.key[1]))];
      report('attribute names', keysRange, `oracle reads the name ${JSON.stringify(source.slice(...oracleAttribute.nameRange))} in`);
      continue;
    }
    if (!rangesEqual(exact.value, oracleAttribute.valueRange)) {
      report('attribute values', [oracleAttribute.nameRange[0], oracleAttribute.valueRange?.[1] ?? oracleAttribute.nameRange[1]], `value ${describeRange(exact.value)}, oracle ${describeRange(oracleAttribute.valueRange)}`);
    }
  }

  const oracleNames = new Set(oracleTag.attributes.map((attribute) => attribute.name));
  for (const attribute of ourTag.attributes) {
    if (matchedKeys.has(attribute)) continue;
    if (gluesTwigTagToOtherContent(attribute.key, twigRanges)) {
      report('attribute names', attribute.key, 'attribute key glues a Twig tag to other content');
      continue;
    }
    if (isTwigOnly(source, attribute.key, twigRanges) || oracleNames.has(masked.slice(...attribute.key).toLowerCase())) continue;
    report('attributes', attribute.key, 'extra attribute');
  }
}

export function compareWithHtmlOracle(source: string, twigRanges: readonly TwigRange[], ast: unknown, issueLimit: number = maxIssuesPerTemplate): OutputIssue[] {
  assertSortedAndDisjoint(source, twigRanges);
  const masked = maskTwig(source, twigRanges);
  const oracle = readOracleDocument(source, masked);
  const ours = collectOurTags(ast);
  const lineOf = createLineLocator(source);
  const issues = new Map<string, OutputIssue>();
  const report: Report = (check, range, message) => {
    const detail = `line ${lineOf(range[0])}: ${message} "${excerpt(source, range)}"`;
    issues.set(`${check}\0${detail}`, { check: `html-oracle: ${check}`, detail, line: lineOf(range[0]), range });
  };

  const isInRawText = (offset: number) => oracle.rawTextRegions.some((region) => containsOffset(region, offset));
  const oursByStart = new Map(ours.map((tag) => [tag.openStart[0], tag]));
  const oracleStarts = new Set(oracle.startTags.map((tag) => tag.range[0]));

  for (const tag of ours) {
    if (oracleStarts.has(tag.openStart[0])) continue;
    if (isInRawText(tag.openStart[0])) report('raw text', [tag.openStart[0], tag.openEnd[1]], `<${tag.name}> is parsed as a tag inside raw text`);
    else report('start tags', [tag.openStart[0], tag.openEnd[1]], `extra start tag <${tag.name}>`);
  }

  for (const oracleTag of oracle.startTags) {
    const ourTag = oursByStart.get(oracleTag.range[0]);
    if (!ourTag) {
      report('start tags', oracleTag.range, `missing start tag <${oracleTag.name}>`);
      continue;
    }
    const oracleOpenStartEnd = openTagStartEnd(source, oracleTag.nameEnd, twigRanges);
    if (ourTag.openStart[1] !== oracleOpenStartEnd) {
      report('tag names', oracleTag.range, `tag name ends at ${ourTag.openStart[1]}, oracle ${oracleOpenStartEnd}`);
      continue;
    }
    if (ourTag.openEnd[1] !== oracleTag.range[1]) report('start tags', oracleTag.range, `start tag ends at ${ourTag.openEnd[1]}, oracle ${oracleTag.range[1]}`);
    compareAttributes(source, twigRanges, masked, oracleTag, ourTag, report);
    if (oracle.parentStarts.get(oracleTag.range[0]) !== ourTag.parentStart) report('parents', ourTag.range, `<${ourTag.name}> sits in a different element than the oracle puts it in`);
  }

  const ourCloseStarts = new Set(ours.flatMap((tag) => (tag.close ? [tag.close[0]] : [])));
  const branchSegments = branchSegmentsOf(source);
  for (const endTag of oracle.endTags) {
    if (ourCloseStarts.has(endTag.range[0])) continue;
    const branchTags = ours.map((tag) => ({ name: tag.name, openStart: tag.openStart[0], isClosed: tag.close !== undefined }));
    const isBranchPaired = isClosedInAnotherBranch(branchSegments, endTag.range[0], endTag.name, branchTags);
    const check = isBranchPaired ? branchPairedEndTagCheck.replace('html-oracle: ', '') : endTagChecks[oracle.endTagKinds.get(endTag.range[0]) ?? 'unmatched'];
    report(check, endTag.range, 'end tag is not the close of any element');
  }

  return [...issues.values()].slice(0, issueLimit);
}
