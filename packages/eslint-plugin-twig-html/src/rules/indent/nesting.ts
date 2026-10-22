import type { Range } from '../../shared/range.js';
import type { IndentUnit } from './options.js';

export function contains(range: Range, offset: number): boolean {
  return range[0] <= offset && offset < range[1];
}

export function depthAt(offset: number, nestings: readonly Range[]): number {
  return nestings.filter((range) => contains(range, offset)).length;
}

export function repeatUnit(unit: IndentUnit, depth: number): string {
  return unit.text.repeat(Math.max(depth, 0));
}
