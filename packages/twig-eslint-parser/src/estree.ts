import * as espree from 'espree';
import type { SourceLocation, SourcePosition } from './source-text.js';

export type EstreeNode = {
  type: string;
  start: number;
  end: number;
  range: [number, number];
  loc: SourceLocation;
  [key: string]: unknown;
};

export type ParsedJavaScript =
  | { readonly isParsed: true; readonly statements: EstreeNode[] }
  | { readonly isParsed: false; readonly reason: string };

function isNode(value: unknown): value is EstreeNode {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function relocateTree(value: unknown, offset: number, locate: (offset: number) => SourcePosition): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      relocateTree(item, offset, locate);
    }
    return;
  }
  if (!isNode(value)) {
    return;
  }

  const start = value.start + offset;
  const end = value.end + offset;
  value.start = start;
  value.end = end;
  value.range = [start, end];
  value.loc = { start: locate(start), end: locate(end) };

  for (const [key, child] of Object.entries(value)) {
    if (key !== 'loc' && key !== 'range') {
      relocateTree(child, offset, locate);
    }
  }
}

export function parseJavaScriptAt(code: string, offset: number, locate: (offset: number) => SourcePosition): ParsedJavaScript {
  let program: { body: unknown[] };
  try {
    program = espree.parse(code, { ecmaVersion: 'latest', sourceType: 'script', range: true }) as unknown as { body: unknown[] };
  } catch (error) {
    return { isParsed: false, reason: error instanceof Error ? error.message : String(error) };
  }

  const statements = program.body.filter(isNode);
  relocateTree(statements, offset, locate);
  return { isParsed: true, statements };
}
