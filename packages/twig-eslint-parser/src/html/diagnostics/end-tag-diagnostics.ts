import { DRUPAL_VOID_ELEMENTS } from '../../drupal.js';
import { isRangeWithin } from '../../range.js';
import { closeTagNameOf, tagNameKey } from '../../es-html-parser/utils/tag-name.js';
import { findTwigBranchSpans, isInsideTwigBranch, isSameOnEveryTwigBranch } from '../../twig/balance.js';
import { VOID_ELEMENT_NAMES } from '../syntax.js';
import { findInnermostOpenElement, openTagTextOf } from './markup-elements.js';
import type { TwigDiagnostic } from '../../diagnostics.js';
import type { MarkupElement, SourceToken } from './markup-elements.js';
import type { MarkupSource } from './markup-source.js';

export type EndTagSource = Pick<MarkupSource, 'document' | 'tokens' | 'blocks' | 'text'> & { readonly elements: readonly MarkupElement[] };

const VOID_ELEMENTS: ReadonlySet<string> = new Set([...VOID_ELEMENT_NAMES, ...DRUPAL_VOID_ELEMENTS]);

function nameOfEndTag(token: SourceToken): string {
  return tagNameKey(closeTagNameOf(token));
}

function findNamesClosedBy(element: MarkupElement, unclosedElements: readonly MarkupElement[]): string[] {
  const isInside = (inner: MarkupElement) => isRangeWithin(inner.range, element.range);
  const elementsClosed = [element, ...unclosedElements.filter(isInside)];

  return elementsClosed.map((closed) => closed.name ?? '');
}

function findLastSelfClosedElementNamed(name: string, endTag: SourceToken, elements: readonly MarkupElement[]): MarkupElement | undefined {
  const isSelfClosedBefore = (element: MarkupElement) => element.selfClosing && element.range[1] <= endTag.range[0] && tagNameKey(element.name ?? '') === name;

  return elements.filter(isSelfClosedBefore).at(-1);
}

function describeStrayEndTag(token: SourceToken, source: EndTagSource): string {
  const selfClosedElement = findLastSelfClosedElementNamed(nameOfEndTag(token), token, source.elements);
  if (selfClosedElement) {
    const writtenTag = `${source.text.slice(...selfClosedElement.openStart.range)} … />`;
    return `${token.value} closes nothing, because the ${writtenTag} before it already ended with "/>". Browsers ignore "/>" on this element, so remove the "/" there or remove this closing tag.`;
  }

  const openElement = findInnermostOpenElement(source.document, token.range[0]);
  if (!openElement) {
    return `${token.value} closes nothing, because no element is open. Remove it or add the opening tag.`;
  }

  return `${token.value} does not match the open ${openTagTextOf(openElement, source.text)}. Remove it or correct its name.`;
}

function mapElementsByCloseStart(elements: readonly MarkupElement[]): Map<number, MarkupElement> {
  return new Map(elements.flatMap((element) => (element.close ? [[element.close.range[0], element] as const] : [])));
}

export function findEndTagDiagnostics(source: EndTagSource): TwigDiagnostic[] {
  const elementByCloseStart = mapElementsByCloseStart(source.elements);
  const unclosedElements = source.elements.filter((element) => !element.close && !element.selfClosing);
  const branchSpans = findTwigBranchSpans(source.blocks);
  const namesClosedAcrossBranches = new Set<string>();
  const diagnostics: TwigDiagnostic[] = [];

  for (const token of source.tokens) {
    if (token.type !== 'CloseTag') {
      continue;
    }

    const closedElement = elementByCloseStart.get(token.range[0]);
    const isPairedAcrossBranches = closedElement !== undefined && !isSameOnEveryTwigBranch(closedElement.range, source.blocks);
    if (isPairedAcrossBranches) {
      for (const name of findNamesClosedBy(closedElement, unclosedElements)) {
        namesClosedAcrossBranches.add(name);
      }
    }
    if (closedElement || isInsideTwigBranch(token.range[0], branchSpans)) {
      continue;
    }

    const name = nameOfEndTag(token);
    const isLeftAlone = VOID_ELEMENTS.has(name) || namesClosedAcrossBranches.has(name);
    if (isLeftAlone) {
      continue;
    }

    diagnostics.push({ code: 'x-invalid-end-tag', message: describeStrayEndTag(token, source), range: token.range });
  }

  return diagnostics;
}
