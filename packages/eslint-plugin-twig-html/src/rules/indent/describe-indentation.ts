import type { IndentUnit } from './options.js';

function unitNameOf(indentation: string, fallback: IndentUnit['name']): string {
  if (indentation === '') {
    return fallback;
  }
  if (/^\t+$/.test(indentation)) {
    return 'tab';
  }
  if (/^ +$/.test(indentation)) {
    return 'space';
  }
  return 'character';
}

export function describeIndentation(indentation: string, fallback: IndentUnit['name']): string {
  const count = indentation.length;
  const unitName = unitNameOf(indentation, fallback);
  return `${count} ${unitName}${count === 1 ? '' : 's'}`;
}
