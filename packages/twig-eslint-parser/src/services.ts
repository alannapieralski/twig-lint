import type { SourceCode } from 'eslint';
import type { TwigParserServices } from './parse-for-eslint.js';

export function readTwigServices(sourceCode: SourceCode, consumerName: string): TwigParserServices {
  const services = sourceCode.parserServices as { twig?: TwigParserServices } | undefined;
  if (!services?.twig) {
    throw new Error(`${consumerName} needs twig-eslint-parser as the parser for this file.`);
  }
  return services.twig;
}
