import type { TwigDiagnostic } from '../../diagnostics.js';
import type { TwigBlockSummary } from '../../twig/blocks.js';
import { findEndTagDiagnostics } from './end-tag-diagnostics.js';
import { findMarkupElements, type MarkupNode, type SourceToken } from './markup-elements.js';
import { findOpenTagDiagnostics } from './open-tag-diagnostics.js';
import { findUnclosedElementDiagnostics } from './unclosed-element-diagnostics.js';

export type MarkupSource = { readonly document: MarkupNode; readonly tokens: readonly SourceToken[]; readonly text: string; readonly blocks: readonly TwigBlockSummary[] };

export function findMarkupDiagnostics({ document, tokens, text, blocks }: MarkupSource): TwigDiagnostic[] {
  const elements = findMarkupElements(document);

  return [
    ...findOpenTagDiagnostics(elements, text, blocks),
    ...findEndTagDiagnostics(tokens, elements, blocks),
    ...findUnclosedElementDiagnostics(elements, blocks, text),
  ];
}
