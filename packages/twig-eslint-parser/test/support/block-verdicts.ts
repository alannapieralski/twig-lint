import { parseForESLint } from '../../src/index.js';
import { CONVERTED_TAGS } from '../../src/twig/tag-grammar.js';
import type { Range } from '../../src/range.js';
import type { TwigBlockSummary } from '../../src/twig/blocks.js';

export type TwigBlockVerdict = { readonly source: string; readonly error: string | null };
export type BlockVerdictComparison = {
  readonly disagreements: readonly { readonly range: Range; readonly description: string }[];
  readonly rejectedByBoth: readonly { readonly range: Range; readonly twigError: string }[];
};

const UNPARSED_MESSAGE_PREFIX = 'This Twig block could not be parsed: ';

function isJudgedByTheParser(block: TwigBlockSummary): boolean {
  return block.kind === 'print' || (block.kind === 'tag' && CONVERTED_TAGS.has(block.tagName ?? ''));
}

/**
 * Compares the parser's verdict on every block it converts with Twig's verdict on the same block.
 *
 * @param code - The template source.
 * @param twigVerdicts - Twig's verdict per block source, from tools/twig-oracle/parse.php.
 * @returns The blocks whose verdicts differ, and the blocks both reject.
 */
export function compareBlockVerdictsWithTwig(code: string, twigVerdicts: readonly TwigBlockVerdict[]): BlockVerdictComparison {
  const { services } = parseForESLint(code);
  const twigErrorBySource = new Map(twigVerdicts.map((verdict) => [verdict.source, verdict.error]));
  const ourReasonBySource = new Map(services.twig.diagnostics
    .filter((diagnostic) => diagnostic.code === 'x-unparsed-twig')
    .map((diagnostic) => [code.slice(...diagnostic.range), diagnostic.message.replace(UNPARSED_MESSAGE_PREFIX, '')]));
  const judgedBlocks = services.twig.blocks.filter(isJudgedByTheParser);
  const disagreements: BlockVerdictComparison['disagreements'][number][] = [];
  const rejectedByBoth: BlockVerdictComparison['rejectedByBoth'][number][] = [];

  for (const block of judgedBlocks) {
    const source = code.slice(...block.range);
    const twigError = twigErrorBySource.get(source);
    if (twigError === undefined) {
      disagreements.push({ range: block.range, description: `no verdict from Twig: ${source}` });
      continue;
    }
    const ourReason = ourReasonBySource.get(source);
    if (twigError !== null && ourReason !== undefined) {
      rejectedByBoth.push({ range: block.range, twigError });
    }
    if ((twigError !== null) !== (ourReason !== undefined)) {
      disagreements.push({ range: block.range, description: `${twigError === null ? 'accepted' : 'rejected'} by Twig: ${source}` });
    } else if (twigError !== null && ourReason !== twigError) {
      disagreements.push({ range: block.range, description: `Twig says "${twigError}" where we say "${ourReason}": ${source}` });
    }
  }

  return { disagreements, rejectedByBoth };
}
