import type { ParsedTag } from './tag-node.js';

export function isOpenTagUnreadable(tag: Pick<ParsedTag, 'openStart'>, unreadableTagStarts: ReadonlySet<number>): boolean {
  return unreadableTagStarts.has(tag.openStart.range[0]);
}
