import type { TwigDiagnostic } from '../diagnostics.js';
import type { TwigBlockSummary } from './blocks.js';
import { middleTags } from './syntax.js';

type OpenFrame = { readonly name: string; hasElse: boolean };

const parentsOfMiddleTag: Readonly<Record<string, ReadonlySet<string>>> = {
  else: new Set(['if', 'for', 'guard']),
  elseif: new Set(['if']),
  plural: new Set(['trans']),
};

const orList = new Intl.ListFormat('en', { type: 'disjunction' });

const tagsThatCannotFollowElse: ReadonlySet<string> = new Set(['else', 'elseif']);

function tagText(tagName: string): string {
  return `{% ${tagName} %}`;
}

function describeMisplacedTag(tagName: string, frame: OpenFrame): string | undefined {
  const allowedParents = parentsOfMiddleTag[tagName];
  if (allowedParents && !allowedParents.has(frame.name)) return `${tagText(tagName)} cannot sit inside ${tagText(frame.name)}. Twig allows it only inside ${orList.format([...allowedParents].map(tagText))}.`;
  if (frame.hasElse && tagsThatCannotFollowElse.has(tagName)) return `${tagText(tagName)} cannot follow ${tagText('else')}. Twig expects ${tagText(`end${frame.name}`)} next.`;

  return undefined;
}

export function findMisplacedTwigTagDiagnostics(blocks: readonly TwigBlockSummary[]): TwigDiagnostic[] {
  const frames: OpenFrame[] = [];
  const diagnostics: TwigDiagnostic[] = [];

  for (const block of blocks) {
    if (block.kind !== 'tag') continue;

    if (block.depthChange === 1) frames.push({ name: block.tagName ?? '', hasElse: false });
    if (block.depthChange === -1) frames.pop();

    const tagName = block.tagName ?? '';
    const frame = frames.at(-1);
    if (!frame || !middleTags.has(tagName)) continue;

    const message = describeMisplacedTag(tagName, frame);
    if (message) diagnostics.push({ code: 'x-misplaced-twig-tag', message, range: block.range });
    if (tagName === 'else') frame.hasElse = true;
  }

  return diagnostics;
}
