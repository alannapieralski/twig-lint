import type { AttributeValue } from './types.js';

const TWIG_THAT_PRINTS_NOTHING = /^(?:\{#|\{%[-~]?\s*(?:if|elseif|else|endif|for|endfor)\b)/;

export function htmlTextOf(value: AttributeValue | undefined): string {
  if (!value) {
    return '';
  }
  if (!value.parts?.length) {
    return value.value;
  }

  return value.parts.filter((part) => part.type === 'Part').map((part) => part.value).join('');
}

export function printsTwigOutput(value: AttributeValue | undefined): boolean {
  return value?.parts?.some((part) => part.type === 'Template' && !TWIG_THAT_PRINTS_NOTHING.test(part.value)) ?? false;
}
