import type { TemplateWrapper } from '../es-html-parser/types/index.js';
import type { TwigBlock } from '../twig/blocks.js';

function delimiterEnd(block: TwigBlock): number {
  const closing = block.tokens.at(-1);
  const lineBreak = /\r?\n$/.exec(closing?.value ?? '')?.[0] ?? '';
  return block.end - lineBreak.length;
}

function templateInfoOf(block: TwigBlock): TemplateWrapper {
  const end = delimiterEnd(block);
  return { open: [block.start, block.start + 2], close: [end - 2, end], kind: block.kind };
}

export function templateInfosOf(blocks: readonly TwigBlock[]): TemplateWrapper[] {
  return blocks.map(templateInfoOf);
}
