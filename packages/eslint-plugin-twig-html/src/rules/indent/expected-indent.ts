import { expectedInCloseTag, expectedInOpenTag } from './html/expected-html-indent.js';
import { repeatUnit } from './options.js';
import type { ResolvedOptions } from './options.js';
import type { IndentLayout } from './types.js';

export function isChecked(offset: number, layout: IndentLayout): boolean {
  if (layout.skipped.covers(offset)) {
    return false;
  }
  if (!layout.depthUnknown.covers(offset)) {
    return true;
  }

  return layout.findOpenTagAt(offset)?.lineIndentationAsWritten !== undefined;
}

export function expectedIndentAt(offset: number, layout: IndentLayout, options: ResolvedOptions): string {
  const { nestings } = layout;

  const openTag = layout.findOpenTagAt(offset);
  if (openTag) {
    return expectedInOpenTag(openTag, offset, nestings, options);
  }

  const closeTag = layout.findCloseTagAt(offset);
  if (closeTag) {
    return expectedInCloseTag(closeTag, nestings, options);
  }

  return repeatUnit(options.unit, nestings.countAt(offset));
}
