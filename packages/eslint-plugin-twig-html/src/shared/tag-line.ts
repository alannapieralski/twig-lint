import type { Range } from './range.js';

type Ranged = { readonly range: Range };

export function countAttributesGluedToTagName(openStartEnd: number, attributes: readonly Ranged[]): number {
  let end = openStartEnd;
  let count = 0;
  for (const attribute of attributes) {
    if (attribute.range[0] !== end) {
      break;
    }
    end = attribute.range[1];
    count += 1;
  }
  return count;
}

export function findTagLineEnd(openStartEnd: number, attributes: readonly Ranged[]): number {
  const gluedCount = countAttributesGluedToTagName(openStartEnd, attributes);
  return attributes[gluedCount - 1]?.range[1] ?? openStartEnd;
}
