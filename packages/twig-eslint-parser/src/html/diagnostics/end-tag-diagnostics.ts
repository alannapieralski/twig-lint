import { isTwigBalancedWithin } from '../../twig/balance.js';
import type { TwigBlockSummary } from '../../twig/blocks.js';
import type { TwigDiagnostic } from '../../diagnostics.js';
import type { MarkupElement, SourceToken } from './markup-elements.js';

const endTagName = /^<\/\s*([^\s>]+)/;

function nameOfEndTag(token: SourceToken): string {
  return (endTagName.exec(token.value)?.[1] ?? '').toLowerCase();
}

function findVoidElementNames(elements: readonly MarkupElement[]): ReadonlySet<string> {
  return new Set(elements.filter((element) => element.selfClosing).map((element) => (element.name ?? '').toLowerCase()));
}

export function findEndTagDiagnostics(tokens: readonly SourceToken[], elements: readonly MarkupElement[], blocks: readonly TwigBlockSummary[]): TwigDiagnostic[] {
  const matchedStarts = new Set(elements.flatMap((element) => (element.close ? [element.close.range[0]] : [])));
  const unmatchedEndTags = tokens.filter((token) => token.type === 'CloseTag' && !matchedStarts.has(token.range[0]));

  const isOutsideTwigBranches = (token: SourceToken) => isTwigBalancedWithin([0, token.range[0]], blocks);
  const isMarkupPairedAcrossTwigBranches = !unmatchedEndTags.every(isOutsideTwigBranches);
  if (isMarkupPairedAcrossTwigBranches) return [];

  const voidElementNames = findVoidElementNames(elements);

  return unmatchedEndTags
    .filter((token) => !voidElementNames.has(nameOfEndTag(token)))
    .map((token): TwigDiagnostic => ({
      code: 'x-invalid-end-tag',
      message: `${token.value} closes nothing, because no element is open. Remove it or add the opening tag.`,
      range: token.range,
    }));
}
