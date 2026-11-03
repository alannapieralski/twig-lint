import { countTrailingHtmlWhitespace } from './html-whitespace.js';
import { findTwigSegments } from './twig-segments.js';
import type { TwigBlockSummary } from 'twig-eslint-parser';
import type { Range } from './range.js';

export function findTransBodies(text: string, blocks: readonly TwigBlockSummary[]): Range[] {
  const transSegments = findTwigSegments(blocks).filter((segment) => segment.frameName === 'trans');

  return transSegments.map(({ range: [start, end] }): Range => {
    const trailingWhitespace = countTrailingHtmlWhitespace(text.slice(start, end));
    return [start, end - trailingWhitespace];
  });
}

export function isInsideTransBody(offset: number, transBodies: readonly Range[]): boolean {
  return transBodies.some(([start, end]) => start <= offset && offset < end);
}
