import { isClosingTag, isMiddleTag, isOpeningTag } from './block-roles.js';
import { PARENTS_OF_MIDDLE_TAG, TAGS_THAT_CANNOT_FOLLOW_ELSE } from './syntax.js';
import { tagText } from './tag-text.js';
import type { TwigDiagnostic } from '../diagnostics.js';
import type { TwigBlockSummary } from './blocks.js';

type OpenFrame = { readonly name: string; hasElse: boolean };

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

export function findMisplacedTwigTagDiagnostics(blocks: readonly TwigBlockSummary[]): TwigDiagnostic[] {
  const frames: OpenFrame[] = [];
  const diagnostics: TwigDiagnostic[] = [];

  for (const block of blocks) {
    if (isOpeningTag(block)) {
      frames.push({ name: block.tagName ?? '', hasElse: false });
    }
    if (isClosingTag(block)) {
      frames.pop();
    }

    const frame = frames.at(-1);
    if (!frame || !isMiddleTag(block)) {
      continue;
    }

    const tagName = block.tagName ?? '';

    const message = describeMisplacedTag(tagName, frame);
    if (message) {
      diagnostics.push({ code: 'x-misplaced-twig-tag', message, range: block.range });
    }
    if (tagName === 'else') {
      frame.hasElse = true;
    }
  }

  return diagnostics;
}
