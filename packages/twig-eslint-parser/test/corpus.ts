import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { evenlySpaced } from '../../../tools/corpus/src/index.js';
import { parseForESLint } from '../src/index.js';
import { createOffsetLocator } from '../src/source-text.js';
import { findParityMismatches } from './lexer/parity.js';
import { compareBlockVerdictsWithTwig } from './support/block-verdicts.js';
import { BRANCH_PAIRED_END_TAG_CHECK, compareWithHtmlOracle, twigRangesFromOracle } from './support/html-oracle.js';
import { measureLineCoverage, statusOfDamage } from './support/line-coverage.js';
import { checkRewritesKeepTheTree } from './support/metamorphic.js';
import { MUTATORS, runMutations, seedFrom } from './support/mutations.js';
import { TEMPLATE_DEFECT_CHECKS, checkParserOutput } from './support/output-checks.js';
import type { Check, CheckOutcome, Finding, PackageCorpus, Template, TemplateCoverage } from '../../../tools/corpus/src/index.js';
import type { Golden } from './lexer/parity.js';
import type { TwigBlockVerdict } from './support/block-verdicts.js';
import type { LineCoverage, TwigReading } from './support/line-coverage.js';
import type { MutationOutcome } from './support/mutations.js';
import type { OutputIssue } from './support/output-checks.js';

type OracleResult = Partial<Golden> & { path: string; twig: string; error?: string; line?: number };
type ParseOracleResult = { path: string; twig: string; blocks?: TwigBlockVerdict[]; error?: string };

const oracleDirectory = resolve(import.meta.dirname, '../tools/twig-oracle');
const tokenizeScript = resolve(oracleDirectory, 'tokenize.php');
const parseScript = resolve(oracleDirectory, 'parse.php');
const ORACLE_CHUNK_SIZE = 500;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function oracleUnavailableReason(): string | undefined {
  if (spawnSync('php', ['-v']).status !== 0) {
    return 'PHP is not installed.';
  }
  if (!existsSync(resolve(oracleDirectory, 'vendor/autoload.php'))) {
    return 'Run composer install in packages/twig-eslint-parser/tools/twig-oracle.';
  }
  return undefined;
}

function runTwigOracle<Result>(script: string, templates: readonly Template[]): Result[] {
  const output = execFileSync('php', [script, '--stdin'], {
    input: templates.map((template) => template.path).join('\n'),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
  });
  return output.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Result);
}

const oracleResultsByPath = new Map<string, OracleResult>();

function* oracleResultsFor(templates: readonly Template[]): Generator<OracleResult> {
  yield* templates.flatMap((template) => oracleResultsByPath.get(template.path) ?? []);
  const uncached = templates.filter((template) => !oracleResultsByPath.has(template.path));
  for (let start = 0; start < uncached.length; start += ORACLE_CHUNK_SIZE) {
    for (const result of runTwigOracle<OracleResult>(tokenizeScript, uncached.slice(start, start + ORACLE_CHUNK_SIZE))) {
      oracleResultsByPath.set(result.path, result);
      yield result;
    }
  }
}

function* parseOracleResultsFor(templates: readonly Template[]): Generator<ParseOracleResult> {
  for (let start = 0; start < templates.length; start += ORACLE_CHUNK_SIZE) {
    yield* runTwigOracle<ParseOracleResult>(parseScript, templates.slice(start, start + ORACLE_CHUNK_SIZE));
  }
}

function compareBlockVerdictsOf(template: Template, verdicts: readonly TwigBlockVerdict[]): ReturnType<typeof compareBlockVerdictsWithTwig> | undefined {
  try {
    return compareBlockVerdictsWithTwig(template.source, verdicts);
  } catch {
    return undefined;
  }
}

function describeLexerMismatches(template: Template, golden: Golden): string[] {
  try {
    return findParityMismatches(template.source, golden);
  } catch (error) {
    return [`our lexer threw: ${describeError(error)}`];
  }
}

const lexerParity: Check = {
  id: 'parser/lexer-parity',
  run(templates, context): CheckOutcome {
    const skipped = oracleUnavailableReason();
    if (skipped !== undefined) {
      return { findings: [], stats: {}, skipped };
    }

    const templatesByPath = new Map(templates.map((template) => [template.path, template]));
    const findings: Finding[] = [];
    let comparedTokens = 0;
    let rejectedByTwig = 0;
    let index = 0;
    for (const result of oracleResultsFor(templates)) {
      context.progress(index, { findings: findings.length });
      index += 1;
      const template = templatesByPath.get(result.path);
      if (!template) {
        throw new Error(`The Twig oracle returned a template that was not sent: ${result.path}`);
      }
      if (result.error !== undefined) {
        rejectedByTwig += 1;
        findings.push({ check: 'parser/lexer-parity', severity: 'report', template, message: `Twig rejects it: ${result.error}`, ...(result.line !== undefined && { line: result.line }) });
        continue;
      }
      comparedTokens += result.tokens?.length ?? 0;
      const mismatches = describeLexerMismatches(template, result as Golden);
      if (mismatches.length > 0) {
        findings.push({ check: 'parser/lexer-parity', severity: 'failure', template, message: mismatches.slice(0, 5).join('; ') });
      }
    }
    return { findings, stats: { templates: templates.length, comparedTokens, rejectedByTwig } };
  },
};

function findUnparsedBlocksWithoutTwig(templates: readonly Template[], context: Parameters<Check['run']>[1], oracleMissingReason: string): CheckOutcome {
  const findings: Finding[] = [];
  let notParsed = 0;
  for (const [index, template] of templates.entries()) {
    context.progress(index, { reports: findings.length });
    try {
      const unparsedBlocks = parseForESLint(template.source).services.twig.diagnostics.filter((diagnostic) => diagnostic.code === 'x-unparsed-twig');
      const locate = createOffsetLocator(template.source);
      for (const block of unparsedBlocks) {
        findings.push({ check: 'parser/block-verdicts', severity: 'report', template, message: `${block.message} Not compared with Twig: ${oracleMissingReason}`, line: locate(block.range[0]).line });
      }
    } catch {
      notParsed += 1;
    }
  }
  return { findings, stats: { templates: templates.length, notParsed, blocksNotComparedWithTwig: findings.length } };
}

const blockVerdicts: Check = {
  id: 'parser/block-verdicts',
  run(templates, context): CheckOutcome {
    const oracleMissingReason = oracleUnavailableReason();
    if (oracleMissingReason !== undefined) {
      return findUnparsedBlocksWithoutTwig(templates, context, oracleMissingReason);
    }

    const templatesByPath = new Map(templates.map((template) => [template.path, template]));
    const findings: Finding[] = [];
    const stats = { templates: templates.length, rejectedByTwig: 0, notParsed: 0, blocksRejectedByBoth: 0 };
    let index = 0;
    for (const result of parseOracleResultsFor(templates)) {
      context.progress(index, { failures: findings.filter((finding) => finding.severity === 'failure').length });
      index += 1;
      const template = templatesByPath.get(result.path);
      if (!template) {
        throw new Error(`The Twig oracle returned a template that was not sent: ${result.path}`);
      }
      if (result.blocks === undefined) {
        stats.rejectedByTwig += 1;
        continue;
      }
      const comparison = compareBlockVerdictsOf(template, result.blocks);
      if (comparison === undefined) {
        stats.notParsed += 1;
        continue;
      }
      const locate = createOffsetLocator(template.source);
      stats.blocksRejectedByBoth += comparison.rejectedByBoth.length;
      for (const block of comparison.rejectedByBoth) {
        findings.push({ check: 'parser/block-verdicts', severity: 'report', template, message: `Twig rejects it too: ${block.twigError}`, line: locate(block.range[0]).line });
      }
      for (const disagreement of comparison.disagreements) {
        findings.push({ check: 'parser/block-verdicts', severity: 'failure', template, message: disagreement.description, line: locate(disagreement.range[0]).line });
      }
    }
    return { findings, stats };
  },
};

const outputMatchesSource: Check = {
  id: 'parser/output-matches-source',
  run(templates, context): CheckOutcome {
    const findings: Finding[] = [];
    const stats = { templates: templates.length, invalidTemplates: 0, elementsLeftOpen: 0, strayCloseTags: 0 };
    for (const [index, template] of templates.entries()) {
      context.progress(index, { findings: findings.length });
      for (const issue of checkParserOutput(template.source)) {
        if (issue.check === 'converts every Twig block') {
          continue;
        }
        if (issue.check === 'template is valid Twig and HTML') {
          stats.invalidTemplates += 1;
        }
        if (issue.check === 'html: element closes' || issue.check === 'html: element left open in a Twig branch') {
          stats.elementsLeftOpen += 1;
        }
        if (issue.check === 'html: stray close tag') {
          stats.strayCloseTags += 1;
        }
        const severity = TEMPLATE_DEFECT_CHECKS.has(issue.check) ? 'report' : 'failure';
        findings.push({ check: 'parser/output-matches-source', severity, template, message: `${issue.check}: ${issue.detail}`, ...(issue.line !== undefined && { line: issue.line }) });
      }
    }
    return { findings, stats };
  },
};

const TEMPLATE_DEFECTS_IN_THE_HTML_ORACLE: ReadonlySet<string> = new Set(['html-oracle: unmatched end tags', BRANCH_PAIRED_END_TAG_CHECK]);

function htmlOracleIssues(template: Template, golden: Golden): readonly OutputIssue[] | undefined {
  let ast: unknown;
  try {
    ast = parseForESLint(template.source).ast;
  } catch {
    return undefined;
  }
  try {
    return compareWithHtmlOracle(template.source, twigRangesFromOracle(template.source, golden), ast);
  } catch (error) {
    return [{ check: 'html-oracle: reads the Twig oracle', detail: describeError(error) }];
  }
}

const htmlOracle: Check = {
  id: 'parser/html-oracle',
  run(templates, context): CheckOutcome {
    const skipped = oracleUnavailableReason();
    if (skipped !== undefined) {
      return { findings: [], stats: {}, skipped };
    }

    const templatesByPath = new Map(templates.map((template) => [template.path, template]));
    const findings: Finding[] = [];
    const stats = { templates: templates.length, rejectedByTwig: 0, notParsed: 0 };
    let index = 0;
    for (const result of oracleResultsFor(templates)) {
      context.progress(index, { findings: findings.length });
      index += 1;
      const template = templatesByPath.get(result.path);
      if (!template) {
        throw new Error(`The Twig oracle returned a template that was not sent: ${result.path}`);
      }
      if (result.error !== undefined) {
        stats.rejectedByTwig += 1;
        continue;
      }
      const issues = htmlOracleIssues(template, result as Golden);
      if (issues === undefined) {
        stats.notParsed += 1;
        continue;
      }
      for (const issue of issues) {
        const severity = TEMPLATE_DEFECTS_IN_THE_HTML_ORACLE.has(issue.check) ? 'report' : 'failure';
        findings.push({ check: 'parser/html-oracle', severity, template, message: `${issue.check}: ${issue.detail}`, ...(issue.line !== undefined && { line: issue.line }) });
      }
    }
    return { findings, stats };
  },
};

const metamorphic: Check = {
  id: 'parser/metamorphic',
  run(templates, context): CheckOutcome {
    const findings: Finding[] = [];
    for (const [index, template] of templates.entries()) {
      context.progress(index, { failures: findings.length });
      for (const issue of checkRewritesKeepTheTree(template.source)) {
        findings.push({ check: 'parser/metamorphic', severity: 'failure', template, message: `${issue.check}: ${issue.detail}`, ...(issue.line !== undefined && { line: issue.line }) });
      }
    }
    return { findings, stats: { templates: templates.length } };
  },
};

function twigReadingFor(result: OracleResult | undefined): TwigReading {
  if (!result) {
    return { kind: 'own-lexer' };
  }
  return result.error === undefined ? { kind: 'oracle', golden: result as Golden } : { kind: 'rejected-by-twig' };
}

function toTemplateCoverage(template: Template, coverage: LineCoverage): TemplateCoverage {
  return {
    template,
    lines: coverage.countedLines,
    uncovered: coverage.lineStatuses.fault,
    excused: coverage.lineStatuses.branchSplit + coverage.lineStatuses.templateDefect,
    spans: coverage.spans.map((span) => ({ startLine: span.startLine, endLine: span.endLine, label: span.cause, detail: span.detail, isExcused: statusOfDamage(span.cause) !== 'fault' })),
  };
}

const lineCoverage: Check = {
  id: 'parser/line-coverage',
  run(templates, context): CheckOutcome {
    const oracleResults = oracleUnavailableReason() === undefined ? new Map([...oracleResultsFor(templates)].map((result) => [result.path, result])) : new Map<string, OracleResult>();
    const findings: Finding[] = [];
    const coverage: TemplateCoverage[] = [];
    const stats: Record<string, number> = { templates: templates.length, lines: 0, parsed: 0, notRead: 0, branchSplit: 0, templateDefect: 0, unlocated: 0, twigFromOracle: oracleResults.size };
    for (const [index, template] of templates.entries()) {
      context.progress(index, { notRead: stats['notRead'] ?? 0 });
      let measured: LineCoverage;
      try {
        measured = measureLineCoverage(template.source, twigReadingFor(oracleResults.get(template.path)));
      } catch (error) {
        findings.push({ check: 'parser/line-coverage', severity: 'failure', template, message: `the measurement crashed: ${describeError(error)}` });
        continue;
      }
      coverage.push(toTemplateCoverage(template, measured));
      stats['lines'] = (stats['lines'] ?? 0) + measured.countedLines;
      stats['parsed'] = (stats['parsed'] ?? 0) + measured.lineStatuses.parsed;
      stats['notRead'] = (stats['notRead'] ?? 0) + measured.lineStatuses.fault;
      stats['branchSplit'] = (stats['branchSplit'] ?? 0) + measured.lineStatuses.branchSplit;
      stats['templateDefect'] = (stats['templateDefect'] ?? 0) + measured.lineStatuses.templateDefect;
      stats['unlocated'] = (stats['unlocated'] ?? 0) + measured.unlocatedIssues;
      for (const span of measured.spans) {
        const lineCount = span.endLine - span.startLine + 1;
        findings.push({ check: 'parser/line-coverage', severity: 'report', template, message: `${span.cause} (${lineCount} lines): ${span.detail}`, line: span.startLine, endLine: span.endLine });
      }
    }
    return { findings, stats, lineCoverage: coverage };
  },
};

const MUTATION_SAMPLE_SIZE = 400;
const MAX_MISSES_LISTED_PER_MUTATOR = 10;

function percentage(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

const mutationRecall: Check = {
  id: 'parser/mutation-recall',
  run(templates, context): CheckOutcome {
    const sample = evenlySpaced(templates.filter((template) => !template.root.includes('/canaries')), MUTATION_SAMPLE_SIZE);
    const outcomes: { readonly template: Template; readonly outcome: MutationOutcome }[] = [];
    for (const [index, template] of sample.entries()) {
      context.progress(index, { mutants: outcomes.length });
      outcomes.push(...runMutations(template.source, seedFrom(template.relativePath)).map((outcome) => ({ template, outcome })));
    }

    const stats: Record<string, number> = { templates: sample.length, mutants: outcomes.length };
    const findings: Finding[] = [];
    for (const mutator of MUTATORS) {
      const own = outcomes.filter(({ outcome }) => outcome.mutator === mutator.name);
      const flagged = own.filter(({ outcome }) => outcome.isFlagged);
      const missedOrFalseAlarm = own.filter(({ outcome }) => (mutator.kind === 'defect' ? !outcome.isFlagged : outcome.isFlagged));
      stats[`${mutator.name} ${mutator.kind === 'defect' ? 'flagged' : 'false alarms'} %`] = percentage(flagged.length, own.length);
      if (mutator.kind === 'defect') {
        stats[`${mutator.name} at the edit %`] = percentage(own.filter(({ outcome }) => outcome.isFlaggedAtTheEdit).length, own.length);
      }
      if (mutator.kind === 'defect') {
        stats[`${mutator.name} as a fault %`] = percentage(own.filter(({ outcome }) => outcome.isFlaggedAsFault).length, own.length);
      }
      for (const { template, outcome } of missedOrFalseAlarm.slice(0, MAX_MISSES_LISTED_PER_MUTATOR)) {
        const message = mutator.kind === 'defect' ? `${mutator.name}: the edit is not flagged` : `${mutator.name}: a harmless edit is flagged as ${outcome.flaggedCauses.join(', ')}`;
        findings.push({ check: 'parser/mutation-recall', severity: 'report', template, message, line: outcome.line });
      }
    }
    return { findings, stats };
  },
};

export default { package: 'twig-eslint-parser', checks: [lexerParity, blockVerdicts, outputMatchesSource, metamorphic, htmlOracle, lineCoverage, mutationRecall] } satisfies PackageCorpus;
