import { pairingKeyOf } from '../../es-html-parser/utils/tag-name.js';
import { isRangeWithin } from '../../range.js';
import { findTwigBranchSpans, isInsideTwigBranch, isSameOnEveryTwigBranch } from '../../twig/balance.js';
import { openTagRangeOf } from './markup-elements.js';
import type { ParseError } from '../../es-html-parser/types/index.js';
import type { Range } from '../../range.js';
import type { TwigBlockSummary } from '../../twig/blocks.js';
import type { MarkupElement } from './markup-elements.js';

export type TwigPolicySource = {
  readonly text: string;
  readonly blocks: readonly TwigBlockSummary[];
  readonly elements: readonly MarkupElement[];
  readonly elementsByTagStart: ReadonlyMap<number, MarkupElement>;
};

type TwigPolicy = {
  readonly text: string;
  readonly blocks: readonly TwigBlockSummary[];
  readonly elementsClosedByALiteralEndTag: ReadonlySet<object>;
  readonly branchSpans: readonly Range[];
  readonly elementsByTagStart: ReadonlyMap<number, MarkupElement>;
  readonly firstCloseAcrossBranchesByName: ReadonlyMap<string, number>;
};

const TWIG_DELIMITER = /\{[{%#]/;

function holdsTwig(writtenTag: string): boolean {
  return TWIG_DELIMITER.test(writtenTag);
}

type StrayEndTag = Extract<ParseError, { code: 'x-invalid-end-tag' }>;

function mayCloseAnElementNamedByTwig(error: StrayEndTag, text: string): boolean {
  const element = error.openElement;
  if (!element) {
    return false;
  }
  const isNameGluedToTwig = holdsTwig(text.slice(...element.openStart.range));
  const extendsTheWrittenName = error.name.startsWith(element.name) && error.name !== element.name;
  return isNameGluedToTwig && extendsTheWrittenName;
}

function findFirstCloseAcrossBranchesByName(elements: readonly MarkupElement[], blocks: readonly TwigBlockSummary[]): Map<string, number> {
  const firstCloseByName = new Map<string, number>();
  const unclosedElements = elements.filter((element) => !element.close && !element.selfClosing);
  const pairedAcrossBranches = elements.filter((element) => element.close && !isSameOnEveryTwigBranch(element.range, blocks));

  for (const element of pairedAcrossBranches) {
    const closeStart = element.close?.range[0] ?? element.range[1];
    const closedWithIt = unclosedElements.filter((inner) => isRangeWithin(inner.range, element.range));
    for (const closed of [element, ...closedWithIt]) {
      const name = pairingKeyOf(closed.name ?? '');
      firstCloseByName.set(name, Math.min(firstCloseByName.get(name) ?? Infinity, closeStart));
    }
  }

  return firstCloseByName;
}

function isOpenTagSameOnEveryBranch(tagStart: number, policy: TwigPolicy): boolean {
  const element = policy.elementsByTagStart.get(tagStart);
  return !element?.openEnd || isSameOnEveryTwigBranch(openTagRangeOf(element), policy.blocks);
}

function isEndTagKept(error: StrayEndTag, policy: TwigPolicy): boolean {
  const isInBranch = isInsideTwigBranch(error.range[0], policy.branchSpans);
  const isAnyNameBuiltByTwig = holdsTwig(policy.text.slice(...error.range)) || mayCloseAnElementNamedByTwig(error, policy.text);
  const closedAcrossBranchesAt = policy.firstCloseAcrossBranchesByName.get(pairingKeyOf(error.name)) ?? Infinity;
  const wasClosedAcrossBranchesBefore = closedAcrossBranchesAt < error.range[0];
  return !isInBranch && !isAnyNameBuiltByTwig && !wasClosedAcrossBranchesBefore;
}

function isUnclosedElementKept(error: Extract<ParseError, { code: 'x-unclosed-element' }>, policy: TwigPolicy): boolean {
  return !policy.elementsClosedByALiteralEndTag.has(error.element) && isSameOnEveryTwigBranch(error.element.range, policy.blocks);
}

function isKeptByPolicy(error: ParseError, policy: TwigPolicy): boolean {
  switch (error.code) {
    case 'eof-in-comment':
      return true;
    case 'duplicate-attribute':
      return !isInsideTwigBranch(error.range[0], policy.branchSpans) && !isInsideTwigBranch(error.firstRange[0], policy.branchSpans);
    case 'eof-in-tag':
    case 'unexpected-character-in-attribute-name':
    case 'unexpected-character-in-unquoted-attribute-value':
    case 'unexpected-solidus-in-tag':
      return isOpenTagSameOnEveryBranch(error.tagStart, policy);
    case 'x-invalid-end-tag':
      return isEndTagKept(error, policy);
    case 'x-unclosed-element':
      return isUnclosedElementKept(error, policy);
  }
}

/**
 * Keeps the markup errors whose truth does not depend on which Twig branch renders or on what a print outputs.
 *
 * @param errors - The errors the HTML parser raised, in any order.
 * @param source - The template's Twig blocks and elements.
 * @returns The errors to report.
 */
export function applyTwigPolicy(errors: readonly ParseError[], source: TwigPolicySource): ParseError[] {
  const strayEndTags = errors.filter((error) => error.code === 'x-invalid-end-tag').filter((error) => mayCloseAnElementNamedByTwig(error, source.text));
  const policy: TwigPolicy = {
    text: source.text,
    blocks: source.blocks,
    elementsClosedByALiteralEndTag: new Set(strayEndTags.flatMap((error) => error.openElement ?? [])),
    branchSpans: findTwigBranchSpans(source.blocks),
    elementsByTagStart: source.elementsByTagStart,
    firstCloseAcrossBranchesByName: findFirstCloseAcrossBranchesByName(source.elements, source.blocks),
  };
  return errors.filter((error) => isKeptByPolicy(error, policy));
}
