import { isClosingTag, isMiddleTag, isOpeningTag } from './block-roles.js';
import { PARENTS_OF_MIDDLE_TAG, TAGS_THAT_CANNOT_FOLLOW_ELSE } from './syntax.js';
import { tagText } from './tag-text.js';
import type { TwigDiagnostic } from '../diagnostics.js';
import type { TwigBlockSummary } from './blocks.js';

export type UnpairedTwigTag = { readonly block: TwigBlockSummary; readonly message: string };
export type TwigTagStructure = { readonly unpairedTag: UnpairedTwigTag | undefined; readonly misplacedTagDiagnostics: readonly TwigDiagnostic[] };

type OpenFrame = { readonly block: TwigBlockSummary; readonly name: string; hasElse: boolean };

const orList = new Intl.ListFormat('en', { type: 'disjunction' });

function describeMisplacedTag(tagName: string, frame: OpenFrame): string | undefined {
  const allowedParents = PARENTS_OF_MIDDLE_TAG[tagName];
  if (allowedParents && !allowedParents.has(frame.name)) {
    return `${tagText(tagName)} cannot sit inside ${tagText(frame.name)}. Twig allows it only inside ${orList.format([...allowedParents].map(tagText))}.`;
  }
  if (frame.hasElse && TAGS_THAT_CANNOT_FOLLOW_ELSE.has(tagName)) {
    return `${tagText(tagName)} cannot follow ${tagText('else')}. Twig expects ${tagText(`end${frame.name}`)} next.`;
  }

  return undefined;
}

function describeTagWithoutOpener(block: TwigBlockSummary): UnpairedTwigTag {
  return { block, message: `Twig tags don't pair up: ${tagText(block.tagName)} has no tag to belong to.` };
}

function describeWrongEnd(block: TwigBlockSummary, frame: OpenFrame): UnpairedTwigTag {
  return { block, message: `Twig tags don't pair up: ${tagText(block.tagName)} cannot close ${tagText(frame.name)}, which needs ${tagText(`end${frame.name}`)}.` };
}

function describeUnclosedTag(frame: OpenFrame): UnpairedTwigTag {
  return { block: frame.block, message: `Twig tags don't pair up: ${tagText(frame.name)} is never closed, it needs ${tagText(`end${frame.name}`)}.` };
}

/**
 * Walks the Twig tags with one stack of open tags, as Twig's parser does, pairing each end tag and checking where each middle tag sits.
 *
 * @param blocks - Every Twig block of the template, in source order.
 * @returns The first tag that does not pair up, and a diagnostic for every middle tag in the wrong place.
 */
export function readTwigTagStructure(blocks: readonly TwigBlockSummary[]): TwigTagStructure {
  const frames: OpenFrame[] = [];
  const misplacedTagDiagnostics: TwigDiagnostic[] = [];

  for (const block of blocks) {
    if (isOpeningTag(block)) {
      frames.push({ block, name: block.tagName ?? '', hasElse: false });
      continue;
    }

    if (isClosingTag(block)) {
      const frame = frames.pop();
      if (!frame) {
        return { unpairedTag: describeTagWithoutOpener(block), misplacedTagDiagnostics };
      }
      if (block.tagName !== `end${frame.name}`) {
        return { unpairedTag: describeWrongEnd(block, frame), misplacedTagDiagnostics };
      }
      continue;
    }

    if (!isMiddleTag(block)) {
      continue;
    }

    const frame = frames.at(-1);
    if (!frame) {
      return { unpairedTag: describeTagWithoutOpener(block), misplacedTagDiagnostics };
    }
    const tagName = block.tagName ?? '';
    const message = describeMisplacedTag(tagName, frame);
    if (message) {
      misplacedTagDiagnostics.push({ code: 'x-misplaced-twig-tag', message, range: block.range });
    }
    if (tagName === 'else') {
      frame.hasElse = true;
    }
  }

  const [firstUnclosed] = frames;
  return { unpairedTag: firstUnclosed && describeUnclosedTag(firstUnclosed), misplacedTagDiagnostics };
}
