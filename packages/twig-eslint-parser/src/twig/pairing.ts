import { isClosingTag, isMiddleTag, isOpeningTag } from './block-roles.js';
import { tagText } from './tag-text.js';
import type { TwigBlockSummary } from './blocks.js';

export type UnpairedTwigTag = { readonly block: TwigBlockSummary; readonly message: string };

export function findUnpairedTwigTag(blocks: readonly TwigBlockSummary[]): UnpairedTwigTag | undefined {
  const openTags: TwigBlockSummary[] = [];

  for (const block of blocks) {
    if (isOpeningTag(block)) {
      openTags.push(block);
      continue;
    }

    const isMiddle = isMiddleTag(block);
    if (!isMiddle && !isClosingTag(block)) {
      continue;
    }

    const openTag = isMiddle ? openTags.at(-1) : openTags.pop();
    if (!openTag) {
      return { block, message: `Twig tags don't pair up: ${tagText(block.tagName)} has no tag to belong to.` };
    }

    const expectedEnd = `end${openTag.tagName}`;
    if (!isMiddle && block.tagName !== expectedEnd) {
      return { block, message: `Twig tags don't pair up: ${tagText(block.tagName)} cannot close ${tagText(openTag.tagName)}, which needs ${tagText(expectedEnd)}.` };
    }
  }

  const [firstUnclosed] = openTags;
  if (!firstUnclosed) {
    return undefined;
  }

  return { block: firstUnclosed, message: `Twig tags don't pair up: ${tagText(firstUnclosed.tagName)} is never closed, it needs ${tagText(`end${firstUnclosed.tagName}`)}.` };
}
