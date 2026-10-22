import { TokenTypes } from "../constants/index.js";
import { CharsBuffer } from "../tokenizer/chars-buffer.js";
import { parseCloseTagName } from "./parse-close-tag-name.js";
import { parseOpenTagName } from "./parse-open-tag-name.js";

type NamedToken = {
  value: string;
  parts?: { type: TokenTypes; value: string }[];
};

type NamePart = { isTemplate: boolean; value: string };

function nameBeforeGluedTemplate(parts: NamePart[], opening: RegExp): string {
  let name = "";
  for (const part of parts) {
    if (part.isTemplate && name.trim() !== "") {
      break;
    }
    name += part.isTemplate ? part.value : part.value.replace(opening, "").toLowerCase();
  }
  return name.trim();
}

function namePartsOf(token: NamedToken): NamePart[] {
  return (token.parts ?? []).map((part) => ({
    isTemplate: part.type === TokenTypes.Template,
    value: part.value,
  }));
}

export function openTagNameOf(buffer: CharsBuffer): string {
  if (!buffer.hasTemplate()) {
    return parseOpenTagName(buffer.value());
  }
  return nameBeforeGluedTemplate(buffer.getParts(), /^</);
}

export function tagNameOf(token: NamedToken): string {
  if (!token.parts || token.parts.length === 0) {
    return parseOpenTagName(token.value);
  }
  return nameBeforeGluedTemplate(namePartsOf(token), /^</);
}

export function closeTagNameOf(token: NamedToken): string {
  if (!token.parts || token.parts.length === 0) {
    return parseCloseTagName(token.value);
  }
  return nameBeforeGluedTemplate(namePartsOf(token), /^<\//);
}

export function tagNameKey(name: string): string {
  return name.replace(/\s+/g, "").replace(/\/$/, "").toLowerCase();
}
