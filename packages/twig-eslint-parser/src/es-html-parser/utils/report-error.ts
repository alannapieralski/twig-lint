import { OpenTagCharacterErrorCode, ParseError, TokenizerState } from "../types/index.js";

export function reportError(state: { errors: ParseError[] }, error: ParseError): void {
  state.errors.push(error);
}

const CHARACTERS_THAT_BREAK_AN_ATTRIBUTE: ReadonlySet<string> = new Set(['"', "'", "<"]);

export function isCharacterThatBreaksAnAttribute(value: string): boolean {
  return CHARACTERS_THAT_BREAK_AN_ATTRIBUTE.has(value);
}

export function reportCharacterInOpenTag(state: TokenizerState, code: OpenTagCharacterErrorCode, characterStart: number): void {
  reportError(state, { code, tagStart: state.tagStart ?? 0, range: [characterStart, characterStart + 1] });
}

export function reportEndOfInputInTag(state: TokenizerState): void {
  const tagStart = state.tagStart ?? 0;
  reportError(state, { code: "eof-in-tag", tagStart, range: [tagStart, state.sourceCode.source.length] });
}
