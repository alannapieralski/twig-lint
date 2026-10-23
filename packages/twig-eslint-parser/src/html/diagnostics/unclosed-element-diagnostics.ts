import { isTwigBalancedWithin } from '../../twig/balance.js';
import type { TwigBlockSummary } from '../../twig/blocks.js';
import type { TwigDiagnostic } from '../../diagnostics.js';
import type { MarkupElement } from './markup-elements.js';

const endTagOptionalElements: ReadonlySet<string> = new Set([
  'body', 'caption', 'colgroup', 'dd', 'dt', 'head', 'html', 'li', 'optgroup', 'option', 'p', 'rp', 'rt', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
]);

function isMissingItsEndTag(element: MarkupElement): boolean {
  const isOpenTagComplete = element.openEnd !== undefined;
  const isEndTagRequired = !endTagOptionalElements.has((element.name ?? '').toLowerCase());

  return isOpenTagComplete && !element.selfClosing && !element.close && isEndTagRequired;
}

export function findUnclosedElementDiagnostics(elements: readonly MarkupElement[], blocks: readonly TwigBlockSummary[], text: string): TwigDiagnostic[] {
  const isSameOnEveryTwigBranch = (element: MarkupElement) => isTwigBalancedWithin([element.openStart.range[0], element.range[1]], blocks);

  return elements
    .filter(isMissingItsEndTag)
    .filter(isSameOnEveryTwigBranch)
    .map((element): TwigDiagnostic => ({
      code: 'x-unclosed-element',
      message: `${text.slice(...element.openStart.range)}> is never closed. Add its closing tag.`,
      range: [element.openStart.range[0], element.openEnd?.range[1] ?? element.openStart.range[1]],
    }));
}
