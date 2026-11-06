import { parse as parseCss, toPlainObject } from 'css-tree';
import { parse as parseMarkupTree, TokenTypes } from '../es-html-parser/index.js';
import { cssVisitorKeys, htmlVisitorKeys } from './visitor-keys.js';
import type { CssNodePlain } from 'css-tree';
import type { ParseError, TemplateInfo } from '../es-html-parser/types/index.js';

type Position = { line: number; column: number };
type Node = { type: string; range: [number, number]; loc: { start: Position; end: Position }; [key: string]: unknown };
type CssNode = { type: string; range?: [number, number]; loc?: { start: Position & { offset: number }; end: Position & { offset: number } } | null; [key: string]: unknown };
type Comment = { readonly type: string; readonly range: [number, number]; readonly loc: Node['loc']; readonly value: unknown };

export type HtmlProgram = {
  readonly type: 'Program';
  readonly body: unknown[];
  readonly range: [number, number];
  readonly loc: Node['loc'];
  readonly tokens: unknown[];
  readonly comments: Comment[];
};
export type HtmlDocument = { readonly program: HtmlProgram; readonly errors: readonly ParseError[] };
export type HtmlParseOptions = { readonly templateInfos: readonly TemplateInfo[]; readonly rawContentTags?: readonly string[]; readonly voidElements?: readonly string[] };

const COMMENT_TOKEN_TYPES: ReadonlySet<string> = new Set([TokenTypes.CommentOpen, TokenTypes.CommentContent, TokenTypes.CommentClose]);

function visit<Visited extends { type: string }>(node: Visited, keysByType: Readonly<Record<string, readonly string[]>>, typeOf: (node: Visited) => string, visitor: (node: Visited) => void): void {
  const childKeys = keysByType[typeOf(node)] ?? [];
  visitor(node);
  for (const key of childKeys) {
    const child = (node as Record<string, unknown>)[key];
    for (const value of Array.isArray(child) ? child : [child]) {
      if (typeof value === 'object' && value !== null && 'type' in value) {
        visit(value as Visited, keysByType, typeOf, visitor);
      }
    }
  }
}

function parseStylesheet(content: Node): CssNodePlain {
  const stylesheet = toPlainObject(parseCss(String(content['value']), {
    context: 'stylesheet',
    offset: content.range[0],
    positions: true,
    line: content.loc.start.line,
    column: content.loc.start.column + 1,
  }));
  visit(stylesheet as unknown as CssNode, cssVisitorKeys, (node) => `Css${node.type}`, (node) => {
    node.type = `Css${node.type}`;
    if (!node.loc) {
      return;
    }
    node.range = [node.loc.start.offset, node.loc.end.offset];
    node.loc.start.column -= 1;
    node.loc.end.column -= 1;
  });
  return stylesheet;
}

export function parseHtmlDocument(text: string, options: HtmlParseOptions): HtmlDocument {
  const { ast, tokens, errors } = parseMarkupTree(text, {
    templateInfos: [...options.templateInfos],
    ...(options.rawContentTags && { rawContentTags: [...options.rawContentTags] }),
    ...(options.voidElements && { voidElements: [...options.voidElements] }),
  });
  const document = ast as unknown as Node;
  const comments: Comment[] = [];
  visit(document, htmlVisitorKeys, (node) => node.type, (node) => {
    if (node.type === 'CommentContent') {
      comments.push({ type: node.type, range: node.range, loc: node.loc, value: node['value'] });
    }
    if (node.type === 'StyleTagContent') {
      node['stylesheet'] = parseStylesheet(node);
    }
  });
  const program: HtmlProgram = {
    type: 'Program',
    body: [document],
    range: document.range,
    loc: document.loc,
    tokens: tokens.filter((token) => !COMMENT_TOKEN_TYPES.has(token.type)),
    comments,
  };
  return { program, errors };
}

export const visitorKeys = htmlVisitorKeys;
