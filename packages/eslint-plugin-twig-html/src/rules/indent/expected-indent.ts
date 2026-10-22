import { contains, depthAt, repeatUnit } from './nesting.js';
import { expectedInCloseTag, expectedInOpenTag, findCloseTagAt, findOpenTagAt } from './html/expected-html-indent.js';
import type { ResolvedOptions } from './options.js';
import type { IndentLayout } from './types.js';

export function isChecked(offset: number, layout: IndentLayout): boolean {
  const isSkipped = layout.skipped.some((range) => contains(range, offset));
  if (isSkipped) return false;

  const isDepthUnknown = layout.depthUnknown.some((range) => contains(range, offset));
  if (!isDepthUnknown) return true;

  return findOpenTagAt(offset, layout)?.lineIndentationAsWritten !== undefined;
}

export function expectedIndentAt(offset: number, layout: IndentLayout, options: ResolvedOptions): string {
  const { nestings } = layout;

  const openTag = findOpenTagAt(offset, layout);
  if (openTag) return expectedInOpenTag(openTag, offset, nestings, options);

  const closeTag = findCloseTagAt(offset, layout);
  if (closeTag) return expectedInCloseTag(closeTag, nestings, options);

  return repeatUnit(options.unit, depthAt(offset, nestings));
}
