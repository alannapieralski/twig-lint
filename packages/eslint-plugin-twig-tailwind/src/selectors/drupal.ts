import type { ClassSelector } from './class-selector.js';

const drupalClassMethods: readonly string[] = ['addClass', 'removeClass'];

export const drupalSelectors: readonly ClassSelector[] = [
  { kind: 'callee', name: `^(?:${drupalClassMethods.join('|')})$`, match: [{ type: 'strings' }] },
];
