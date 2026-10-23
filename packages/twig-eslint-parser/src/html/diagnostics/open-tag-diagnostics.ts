import type { AttributeNode } from '../../attributes.js';
import type { TwigDiagnostic } from '../../diagnostics.js';
import type { TwigBlockSummary } from '../../twig/blocks.js';
import type { MarkupElement } from './markup-elements.js';

type StrayCharacterDiagnostic = Pick<TwigDiagnostic, 'code' | 'message'>;
type Range = readonly [number, number];

const quotedValue = /"[^"]*"|'[^']*'/g;
const characterThatBreaksAnAttribute = /["'<]/;

const strayCharacterInName: StrayCharacterDiagnostic = {
  code: 'unexpected-character-in-attribute-name',
  message: 'An attribute name contains a quote or "<", so an attribute value was probably quoted wrongly. Check the quotes before it.',
};

const strayCharacterInValue: StrayCharacterDiagnostic = {
  code: 'unexpected-character-in-unquoted-attribute-value',
  message: 'An unquoted attribute value contains a quote or "<", so the tag swallows the markup after it. Quote the value or close the tag.',
};

function textWithoutTwig(text: string, range: Range, blocks: readonly TwigBlockSummary[]): string {
  const blocksWithin = blocks.filter((block) => block.range[0] >= range[0] && block.range[1] <= range[1]);
  let remaining = '';
  let position = range[0];

  for (const block of blocksWithin) {
    remaining += text.slice(position, block.range[0]);
    position = block.range[1];
  }

  return remaining + text.slice(position, range[1]);
}

function describeStrayCharacter(attribute: AttributeNode, text: string, blocks: readonly TwigBlockSummary[]): StrayCharacterDiagnostic | undefined {
  const withoutQuotedValues = textWithoutTwig(text, attribute.range, blocks).replace(quotedValue, '');
  if (!characterThatBreaksAnAttribute.test(withoutQuotedValues)) return undefined;

  const [name = ''] = withoutQuotedValues.split('=');
  return characterThatBreaksAnAttribute.test(name) ? strayCharacterInName : strayCharacterInValue;
}

function findUnterminatedOpenTag(element: MarkupElement): TwigDiagnostic {
  const attributeEnds = element.attributes.map((attribute) => attribute.range[1]);
  const end = Math.max(element.openStart.range[1], ...attributeEnds);

  return {
    code: 'eof-in-tag',
    message: 'This tag never ends with ">", so the markup after it is read as part of the tag. Add the ">".',
    range: [element.openStart.range[0], end],
  };
}

function findOpenTagDiagnostic(element: MarkupElement, text: string, blocks: readonly TwigBlockSummary[]): TwigDiagnostic | undefined {
  if (!element.openEnd) return findUnterminatedOpenTag(element);

  const strayCharacter = element.attributes.map((attribute) => describeStrayCharacter(attribute, text, blocks)).find((description) => description !== undefined);
  if (!strayCharacter) return undefined;

  return { ...strayCharacter, range: [element.openStart.range[0], element.openEnd.range[1]] };
}

export function findOpenTagDiagnostics(elements: readonly MarkupElement[], text: string, blocks: readonly TwigBlockSummary[]): TwigDiagnostic[] {
  return elements.map((element) => findOpenTagDiagnostic(element, text, blocks)).filter((diagnostic) => diagnostic !== undefined);
}
