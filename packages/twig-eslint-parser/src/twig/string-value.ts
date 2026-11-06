const ESCAPED_CHARACTER_BY_LETTER: Readonly<Record<string, string>> = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
const LINE_BREAK = /\r\n|\r|\n/g;
const HEXADECIMAL_ESCAPE = /^x([0-9a-fA-F]{1,2})/;
const OCTAL_ESCAPE = /^[0-7]{1,3}/;

function readEscapeSequence(text: string, position: number): { readonly bytes: Buffer; readonly next: number } {
  if (position >= text.length) {
    return { bytes: Buffer.from('\\'), next: position };
  }

  const character = String.fromCodePoint(text.codePointAt(position) ?? 0);
  const escapedCharacter = ESCAPED_CHARACTER_BY_LETTER[character];
  if (escapedCharacter) {
    return { bytes: Buffer.from(escapedCharacter), next: position + 1 };
  }

  const hexadecimal = HEXADECIMAL_ESCAPE.exec(text.slice(position, position + 3));
  if (hexadecimal?.[1]) {
    return { bytes: Buffer.from([parseInt(hexadecimal[1], 16)]), next: position + hexadecimal[0].length };
  }

  const octal = OCTAL_ESCAPE.exec(text.slice(position, position + 3));
  if (octal) {
    return { bytes: Buffer.from([parseInt(octal[0], 8) % 256]), next: position + octal[0].length };
  }

  return { bytes: Buffer.from(character), next: position + character.length };
}

/**
 * Turns the source of a string literal's content into the value Twig stores, as PHP's stripcslashes() does.
 *
 * @param content - The text between the quotes, or between interpolations.
 * @returns The string value.
 */
export function decodeTwigString(content: string): string {
  const text = content.replace(LINE_BREAK, '\n');
  const chunks: Buffer[] = [];
  let position = 0;
  while (position < text.length) {
    const backslash = text.indexOf('\\', position);
    if (backslash === -1) {
      chunks.push(Buffer.from(text.slice(position)));
      break;
    }
    chunks.push(Buffer.from(text.slice(position, backslash)));
    const escape = readEscapeSequence(text, backslash + 1);
    chunks.push(escape.bytes);
    position = escape.next;
  }
  return Buffer.concat(chunks).toString('utf8');
}
