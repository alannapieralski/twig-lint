import { isClosingTag, isMiddleTag, isOpeningTag } from './block-roles.js';
import { PARENTS_OF_MIDDLE_TAG, TAGS_THAT_CANNOT_FOLLOW_ELSE } from './syntax.js';
import { tagText } from './tag-text.js';
import type { TwigDiagnostic } from '../diagnostics.js';
import type { TwigBlockSummary } from './blocks.js';

export type UnpairedTwigTag = { readonly block: TwigBlockSummary; readonly message: string };
export type TwigTagPairs =
  | { readonly isPaired: false; readonly unpairedTag: UnpairedTwigTag }
  | { readonly isPaired: true; readonly openerIndexByBlockIndex: ReadonlyMap<number, number> };

type OpenTag = { readonly index: number; readonly block: TwigBlockSummary };

const orList = new Intl.ListFormat('en', { type: 'disjunction' });

function describeTagWithoutOpener(block: TwigBlockSummary): UnpairedTwigTag {
  return { block, message: `Twig tags don't pair up: ${tagText(block.tagName)} has no tag to belong to.` };
}

function describeWrongEnd(block: TwigBlockSummary, opener: TwigBlockSummary): UnpairedTwigTag {
  return { block, message: `Twig tags don't pair up: ${tagText(block.tagName)} cannot close ${tagText(opener.tagName)}, which needs ${tagText(`end${opener.tagName ?? ''}`)}.` };
}

function describeUnclosedTag(opener: TwigBlockSummary): UnpairedTwigTag {
  return { block: opener, message: `Twig tags don't pair up: ${tagText(opener.tagName)} is never closed, it needs ${tagText(`end${opener.tagName ?? ''}`)}.` };
}

/**
 * Pairs the Twig tags with one stack of open tags, as Twig's parser does: each end tag with the tag it closes, and each middle tag with the tag it sits in.
 *
 * @param blocks - The summary of every Twig block of the template, in source order.
 * @returns The first tag that does not pair up, or the index of the opening tag for every end and middle tag.
 */
export function pairTwigTags(blocks: readonly TwigBlockSummary[]): TwigTagPairs {
  const openTags: OpenTag[] = [];
  const openerIndexByBlockIndex = new Map<number, number>();

  for (const [index, block] of blocks.entries()) {
    if (isOpeningTag(block)) {
      openTags.push({ index, block });
      continue;
    }
    const isEndTag = isClosingTag(block);
    if (!isEndTag && !isMiddleTag(block)) {
      continue;
    }

    const openTag = isEndTag ? openTags.pop() : openTags.at(-1);
    if (!openTag) {
      return { isPaired: false, unpairedTag: describeTagWithoutOpener(block) };
    }
    if (isEndTag && block.tagName !== `end${openTag.block.tagName ?? ''}`) {
      return { isPaired: false, unpairedTag: describeWrongEnd(block, openTag.block) };
    }
    openerIndexByBlockIndex.set(index, openTag.index);
  }

  const [firstUnclosed] = openTags;
  return firstUnclosed ? { isPaired: false, unpairedTag: describeUnclosedTag(firstUnclosed.block) } : { isPaired: true, openerIndexByBlockIndex };
}

function describeMisplacedTag(tagName: string, openerName: string, isAfterElse: boolean): string | undefined {
  const allowedParents = PARENTS_OF_MIDDLE_TAG[tagName];
  if (allowedParents && !allowedParents.has(openerName)) {
    return `${tagText(tagName)} cannot sit inside ${tagText(openerName)}. Twig allows it only inside ${orList.format([...allowedParents].map(tagText))}.`;
  }
  if (isAfterElse && TAGS_THAT_CANNOT_FOLLOW_ELSE.has(tagName)) {
    return `${tagText(tagName)} cannot follow ${tagText('else')}. Twig expects ${tagText(`end${openerName}`)} next.`;
  }

  return undefined;
}

/**
 * Finds every middle tag in a place Twig rejects: outside the tags that allow it, or after an `else`.
 *
 * @param blocks - The summary of every Twig block of the template, in source order.
 * @param openerIndexByBlockIndex - The index of the opening tag of every end and middle tag, from pairTwigTags().
 * @returns A diagnostic for every misplaced middle tag.
 */
export function findMisplacedTagDiagnostics(blocks: readonly TwigBlockSummary[], openerIndexByBlockIndex: ReadonlyMap<number, number>): TwigDiagnostic[] {
  const openersWithElse = new Set<number>();
  const diagnostics: TwigDiagnostic[] = [];

  for (const [index, block] of blocks.entries()) {
    const openerIndex = openerIndexByBlockIndex.get(index);
    if (!isMiddleTag(block) || openerIndex === undefined) {
      continue;
    }

    const tagName = block.tagName ?? '';
    const message = describeMisplacedTag(tagName, blocks[openerIndex]?.tagName ?? '', openersWithElse.has(openerIndex));
    if (message) {
      diagnostics.push({ code: 'x-misplaced-twig-tag', message, range: block.range });
    }
    if (tagName === 'else') {
      openersWithElse.add(openerIndex);
    }
  }

  return diagnostics;
}
