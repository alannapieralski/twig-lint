export const skippedElements: readonly string[] = ['script', 'style'];

export const whitespaceSensitiveElements: readonly string[] = ['pre', 'textarea'];

export const inlineNonVoidElements: readonly string[] = [
  'a', 'abbr', 'audio', 'b', 'bdi', 'bdo', 'canvas', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'iframe', 'ins', 'kbd', 'label', 'map',
  'mark', 'noscript', 'object', 'output', 'picture', 'q', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'svg', 'time', 'u',
  'var', 'video',
];

const rawTextElementsWithTrimmedEdges: readonly string[] = ['title'];

export const elementsWithUnrenderedEdgeWhitespace: ReadonlySet<string> = new Set([
  ...rawTextElementsWithTrimmedEdges,
  'address', 'article', 'aside', 'blockquote', 'body', 'button', 'center', 'details', 'dialog', 'div', 'dl', 'dd', 'dt', 'fieldset', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'html', 'legend', 'li', 'main', 'menu', 'nav', 'ol', 'p',
  'search', 'section', 'summary', 'select', 'option', 'optgroup', 'datalist', 'ul', 'table', 'caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'svg', 'g', 'defs', 'symbol', 'clippath', 'mask', 'pattern', 'marker', 'filter', 'lineargradient', 'radialgradient',
]);
