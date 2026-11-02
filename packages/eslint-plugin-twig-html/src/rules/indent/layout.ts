import { createCloseTagLookup, createOpenTagLookup } from './html/expected-html-indent.js';
import { describeOpenTags, findHtmlRegions } from './html/html-regions.js';
import { createRangeCoverage } from './range-lookup.js';
import { findSeams } from './seams.js';
import { findTwigRegions } from './twig/twig-regions.js';
import { findYamlFrontMatter } from './yaml-front-matter.js';
import type { TwigBlockSummary } from 'twig-eslint-parser';
import type { HtmlSource } from './html/html-regions.js';
import type { MarkupNode } from './html/types.js';
import type { TwigSegment } from './twig/types.js';
import type { IndentLayout } from './types.js';

export type LayoutSource = HtmlSource & { readonly blocks: readonly TwigBlockSummary[] };

export function buildIndentLayout(document: MarkupNode, segments: readonly TwigSegment[], source: LayoutSource): IndentLayout {
  const html = findHtmlRegions(document, source);
  const twig = findTwigRegions(segments, source.blocks);
  const seams = findSeams(html.elements, segments);
  const depthUnknown = createRangeCoverage([...seams.branchSplitContent, ...html.unclosedContent]);
  const openTags = describeOpenTags(html.elements, source, depthUnknown);

  return {
    nestings: createRangeCoverage([...html.nestings, ...twig.nestings]),
    skipped: createRangeCoverage([...findYamlFrontMatter(source.text), ...seams.splitOpenTags, ...html.skipped, ...twig.skipped]),
    depthUnknown,
    findOpenTagAt: createOpenTagLookup(openTags),
    findCloseTagAt: createCloseTagLookup(html.closeTags),
  };
}
