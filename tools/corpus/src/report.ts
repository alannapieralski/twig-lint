import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { findingKey } from './baseline.js';
import { isCanary } from './canaries.js';
import { coverageNdjson, renderCoverage, summariseCoverage } from './coverage.js';
import { hashText } from './hash.js';
import { evenlySpaced } from './sampling.js';
import { unifiedDiff } from './diff.js';
import type { CoverageTotals } from './coverage.js';
import type { Check, CheckOutcome, Finding, FixChange } from './types.js';

export type CheckResult = {
  readonly package: string;
  readonly check: Check;
  readonly outcome: CheckOutcome;
  readonly seconds: number;
};

export type CheckReport = {
  readonly package: string;
  readonly id: string;
  readonly stats: Readonly<Record<string, number>>;
  readonly skipped?: string;
  readonly reports: number;
  readonly hasCorpusCoverage: boolean;
  readonly coverage?: CoverageTotals;
  readonly failures: number;
  readonly knownFailures: number;
  readonly newFailures: readonly Finding[];
  readonly seconds: number;
};

const MAX_FAILURE_FILES_PER_CHECK = 25;
const MAX_LISTED_FAILURES_PER_CHECK = 10;
const VENDOR_PATH = /(^|\/)(core|contrib|dist)\//;
const EXCERPT_CONTEXT_LINES = 2;

export function buildCheckReport({ package: packageName, check, outcome, seconds }: CheckResult, baseline: ReadonlySet<string>, isExpectedFailure: (finding: Finding) => boolean = () => false): CheckReport {
  const failures = outcome.findings.filter((finding) => finding.severity === 'failure');
  const newFailures = failures.filter((finding) => !baseline.has(findingKey(finding)) && !isExpectedFailure(finding));
  return {
    package: packageName,
    id: check.id,
    stats: outcome.stats,
    ...(outcome.skipped !== undefined && { skipped: outcome.skipped }),
    reports: outcome.findings.filter((finding) => finding.severity === 'report').length,
    ...(outcome.lineCoverage && { coverage: summariseCoverage(outcome.lineCoverage) }),
    hasCorpusCoverage: check.rule === undefined || outcome.findings.some((finding) => finding.severity === 'report' && !isCanary(finding.template)),
    failures: failures.length,
    knownFailures: failures.length - newFailures.length,
    newFailures,
    seconds,
  };
}

export function buildCheckReports(results: readonly CheckResult[], baseline: ReadonlySet<string>, isExpectedFailure?: (finding: Finding) => boolean): CheckReport[] {
  return results.map((result) => buildCheckReport(result, baseline, isExpectedFailure));
}

export function renderCanaries(notes: readonly string[]): string {
  if (notes.length === 0) {
    return '';
  }
  return `${['', '## Canaries', '', ...notes].join('\n')}\n`;
}

function checkDirectoryName(id: string): string {
  return id.replaceAll('/', '__');
}

function describeLocation(finding: Finding): string {
  return `${finding.template.root} :: ${finding.template.relativePath}${finding.line === undefined ? '' : `:${finding.line}`}`;
}

function renderSummary(reports: readonly CheckReport[], templateCount: number, rootCount: number): string {
  const lines = [
    '# Corpus run',
    '',
    `${templateCount} templates from ${rootCount} roots.`,
    '',
    '| Check | Templates | Reports | Failures | New | Known | Seconds | Notes |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const report of reports) {
    const { templates = '', ...otherStats } = report.stats;
    const coverage = report.hasCorpusCoverage ? [] : ['**no reports outside the canaries**'];
    const notes = report.skipped ?? [...coverage, ...Object.entries(otherStats).map(([name, value]) => `${name} ${value}`)].join(', ');
    lines.push(`| ${report.id} | ${templates} | ${report.reports} | ${report.failures} | ${report.newFailures.length} | ${report.knownFailures} | ${report.seconds.toFixed(1)} | ${notes} |`);
  }
  for (const report of reports.filter((candidate) => candidate.newFailures.length > 0)) {
    lines.push('', `## New failures: ${report.id}`, '');
    for (const finding of report.newFailures.slice(0, MAX_LISTED_FAILURES_PER_CHECK)) {
      lines.push(`- ${describeLocation(finding)}: ${finding.message}`);
    }
    const unlisted = report.newFailures.length - MAX_LISTED_FAILURES_PER_CHECK;
    if (unlisted > 0) {
      lines.push(`- ... and ${unlisted} more in findings.ndjson`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function renderCoverageSections(results: readonly CheckResult[]): string {
  return results.flatMap(({ check, outcome }) => (outcome.lineCoverage ? [renderCoverage(check.id, outcome.lineCoverage)] : [])).join('');
}

function writeCoverage(directory: string, results: readonly CheckResult[]): void {
  const lines = results.flatMap(({ check, outcome }) => (outcome.lineCoverage ? coverageNdjson(check.id, outcome.lineCoverage) : []));
  if (lines.length > 0) {
    writeFileSync(join(directory, 'coverage.ndjson'), `${lines.join('\n')}\n`);
  }
}

function renderStaleBaseline(staleKeys: readonly string[]): string {
  if (staleKeys.length === 0) {
    return '';
  }
  const listed = staleKeys.slice(0, MAX_LISTED_FAILURES_PER_CHECK).map((key) => `- ${key}`);
  const unlisted = staleKeys.length > MAX_LISTED_FAILURES_PER_CHECK ? [`- ... and ${staleKeys.length - MAX_LISTED_FAILURES_PER_CHECK} more`] : [];
  return `${['', `## Stale baseline entries: ${staleKeys.length}`, '', 'These known failures no longer happen. Run with --update-baseline to drop them.', '', ...listed, ...unlisted].join('\n')}\n`;
}

function statusOf(finding: Finding, baseline: ReadonlySet<string>, isExpectedFailure: (finding: Finding) => boolean): 'report' | 'skipped' | 'expected' | 'known' | 'new' {
  if (finding.severity !== 'failure') {
    return finding.severity;
  }
  if (isExpectedFailure(finding)) {
    return 'expected';
  }
  return baseline.has(findingKey(finding)) ? 'known' : 'new';
}

function excerptOf(finding: Finding): string | undefined {
  if (finding.line === undefined) {
    return undefined;
  }
  return finding.template.source.split(/\r?\n/)[finding.line - 1]?.trim().slice(0, 160);
}

function writeFindings(directory: string, results: readonly CheckResult[], baseline: ReadonlySet<string>, isExpectedFailure: (finding: Finding) => boolean): void {
  const lines = results.flatMap(({ outcome }) => outcome.findings.map((finding) => JSON.stringify({
    check: finding.check,
    status: statusOf(finding, baseline, isExpectedFailure),
    root: finding.template.root,
    file: finding.template.relativePath,
    line: finding.line,
    column: finding.column,
    endLine: finding.endLine,
    endColumn: finding.endColumn,
    message: finding.message,
    excerpt: excerptOf(finding),
    vendor: VENDOR_PATH.test(finding.template.relativePath),
    templateHash: hashText(finding.template.source),
  })));
  writeFileSync(join(directory, 'findings.ndjson'), lines.length === 0 ? '' : `${lines.join('\n')}\n`);
}

function writeFailureFiles(directory: string, results: readonly CheckResult[]): void {
  for (const { check, outcome } of results) {
    const withDiffs = outcome.findings.filter((finding) => finding.severity === 'failure' && finding.before !== undefined && finding.after !== undefined);
    if (withDiffs.length === 0) {
      continue;
    }
    const checkDirectory = join(directory, 'failures', checkDirectoryName(check.id));
    mkdirSync(checkDirectory, { recursive: true });
    withDiffs.slice(0, MAX_FAILURE_FILES_PER_CHECK).forEach((finding, index) => {
      const body = `${describeLocation(finding)}\n${finding.message}\n\n${unifiedDiff(finding.before ?? '', finding.after ?? '')}`;
      writeFileSync(join(checkDirectory, `${String(index + 1).padStart(2, '0')}-${basename(finding.template.path)}.txt`), body);
    });
  }
}

function describeReportInContext(finding: Finding): string {
  const lines = finding.template.source.split(/\r?\n/);
  const line = finding.line ?? 1;
  const first = Math.max(1, line - EXCERPT_CONTEXT_LINES);
  const context = lines.slice(first - 1, line + EXCERPT_CONTEXT_LINES).map((text, index) => `${String(first + index).padStart(5)}${first + index === line ? ' >' : '  '} ${text}`);
  return [`${describeLocation(finding)}${finding.column === undefined ? '' : `:${finding.column}`}`, finding.message, '', '```twig', ...context, '```', ''].join('\n');
}

function writeReportSamples(directory: string, check: Check, reports: readonly Finding[], sampleSize: number): void {
  const byMessage = Map.groupBy(reports.filter((finding) => !VENDOR_PATH.test(finding.template.relativePath)), (finding) => finding.message.replace(/\d+/g, '#').split(': ').slice(0, 2).join(': '));
  const perMessage = Math.max(1, Math.ceil(sampleSize / Math.max(byMessage.size, 1)));
  const sections = [...byMessage].flatMap(([message, findings]) => [`## ${message} (${findings.length})`, '', ...evenlySpaced(findings, perMessage).map(describeReportInContext)]);
  const checkDirectory = join(directory, 'samples', checkDirectoryName(check.id));
  mkdirSync(checkDirectory, { recursive: true });
  writeFileSync(join(checkDirectory, 'reports.md'), `# ${check.id}: sampled reports outside core, contrib and dist\n\n${sections.join('\n')}`);
}

function writeSamples(directory: string, results: readonly CheckResult[], sampleSize: number): void {
  for (const { check, outcome } of results) {
    if (sampleSize === 0) {
      continue;
    }
    const reports = outcome.findings.filter((finding) => finding.severity === 'report');
    if (reports.length > 0) {
      writeReportSamples(directory, check, reports, sampleSize);
    }
    const changes: readonly FixChange[] = outcome.changes ?? [];
    if (changes.length === 0) {
      continue;
    }
    const checkDirectory = join(directory, 'samples', checkDirectoryName(check.id));
    mkdirSync(checkDirectory, { recursive: true });
    evenlySpaced(changes, sampleSize).forEach((change, index) => {
      const body = `${change.template.root} :: ${change.template.relativePath}\n\n${unifiedDiff(change.before, change.after)}`;
      writeFileSync(join(checkDirectory, `${String(index + 1).padStart(2, '0')}-${basename(change.template.path)}.diff`), body);
    });
  }
}

export function writeReport(directory: string, input: {
  readonly results: readonly CheckResult[];
  readonly reports: readonly CheckReport[];
  readonly baseline: ReadonlySet<string>;
  readonly templateCount: number;
  readonly rootCount: number;
  readonly sampleSize: number;
  readonly staleBaselineKeys: readonly string[];
  readonly comparison: string;
  readonly isExpectedFailure: (finding: Finding) => boolean;
}): string {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const summary = renderSummary(input.reports, input.templateCount, input.rootCount) + renderCoverageSections(input.results) + renderStaleBaseline(input.staleBaselineKeys) + input.comparison;
  writeFileSync(join(directory, 'summary.md'), summary);
  writeFileSync(join(directory, 'summary.json'), `${JSON.stringify(input.reports.map(({ newFailures, ...rest }) => ({ ...rest, newFailures: newFailures.length })), null, 2)}\n`);
  writeFindings(directory, input.results, input.baseline, input.isExpectedFailure);
  writeCoverage(directory, input.results);
  writeFailureFiles(directory, input.results);
  writeSamples(directory, input.results, input.sampleSize);
  return summary;
}
