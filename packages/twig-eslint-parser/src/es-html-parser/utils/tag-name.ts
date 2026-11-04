import { CharsBuffer } from "../tokenizer/chars-buffer.js";

const TAG_NAME_END = /[\t\n\f\r />]/;
const WHITESPACE = /\s+/g;

/**
 * Reads an element name as the tag name state does: HTML characters lower-cased up to whitespace, "/" or ">".
 * A template glued after the name ends it; a template right after the opening is the name.
 *
 * @param buffer - The open tag start or close tag read so far, opening included.
 * @param opening - "<" for an open tag, "</" for a close tag.
 * @returns The element name, or "" when the opening is followed by whitespace.
 */
export function readTagName(buffer: CharsBuffer, opening: "<" | "</"): string {
  let name = "";
  for (const [index, chars] of buffer.getParts().entries()) {
    if (chars.isTemplate) {
      if (name !== "") {
        return name;
      }
      name = chars.value;
      continue;
    }
    const text = index === 0 ? chars.value.slice(opening.length) : chars.value;
    const end = text.search(TAG_NAME_END);
    name += (end === -1 ? text : text.slice(0, end)).toLowerCase();
    if (end !== -1) {
      return name;
    }
  }
  return name;
}

export function pairingKeyOf(name: string): string {
  return name.replace(WHITESPACE, "");
}
