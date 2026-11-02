import { Lexer } from '../lexer/Lexer.js';
import { SyntaxError as TwigLexerSyntaxError } from '../lexer/SyntaxError.js';
import type { TokenType } from '../lexer/TokenType.js';

export type TwigTokenType = TokenType;
export type TwigToken = { readonly type: TwigTokenType; readonly value: string; readonly start: number; readonly end: number };

const NON_SIGNIFICANT_TYPES: ReadonlySet<TwigTokenType> = new Set(['WHITESPACE', 'TRIMMING_MODIFIER', 'LINE_TRIMMING_MODIFIER', 'INLINE_COMMENT']);

export function isSignificant(token: TwigToken): boolean {
  return !NON_SIGNIFICANT_TYPES.has(token.type);
}

export class TwigSyntaxError extends Error {
  readonly lineNumber: number;
  readonly column: number;

  constructor(message: string, lineNumber: number, column: number) {
    super(message);
    this.name = 'TwigSyntaxError';
    this.lineNumber = lineNumber;
    this.column = column;
  }
}

function lexTwig(source: string): ReturnType<Lexer['tokenize']> {
  try {
    return new Lexer(3).tokenize(source);
  } catch (error) {
    if (error instanceof TwigLexerSyntaxError) {
      throw new TwigSyntaxError(error.message, error.line, error.column);
    }
    throw error;
  }
}

export function tokenizeTwig(source: string): TwigToken[] {
  let start = 0;
  const tokens = lexTwig(source).map((token): TwigToken => {
    const value = token.value === null || token.value === undefined ? '' : String(token.value);
    const positioned = { type: token.type, value, start, end: start + value.length };
    start = positioned.end;
    return positioned;
  });

  if (start !== source.length) {
    throw new Error(`Twig tokens cover ${start} of ${source.length} characters; the lexer is expected to be lossless.`);
  }
  return tokens;
}
