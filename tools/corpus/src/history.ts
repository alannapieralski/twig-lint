import { existsSync, readFileSync } from 'node:fs';
import { formatScore, scoreOf, templatesToScore } from './coverage.js';
import { writeFileAtomically } from './files.js';
import { hashText } from './hash.js';
import type { CheckOutcome, Finding, FixChange, Template } from './types.js';

type Severity = Finding['severity'] | 'fix';
type LineCounts = readonly [lines: number, uncovered: number, excused: number];
type CheckHistory = {
  readonly skipped?: string;
  readonly templates: readonly string[];
  readonly fingerprints: Readonly<Record<string, readonly string[]>>;
  readonly coverage?: Readonly<Record<string, LineCounts>>;
};
export type RunHistory = { readonly templates: Readonly<Record<string, string>>; readonly checks: Readonly<Record<string, CheckHistory>> };
export type CheckRun = { readonly id: string; readonly outcome: CheckOutcome };

type Counts = Readonly<Record<Severity, number>>;
type Example = { readonly template: string; readonly fingerprint: string };
export type CoverageComparison = { readonly before: LineCounts; readonly after: LineCounts };
export type CheckComparison = {
  readonly id: string;
  readonly comparableTemplates: number;
  readonly before: Counts;
  readonly after: Counts;
  readonly added: readonly Example[];
  readonly removed: readonly Example[];
  readonly wasSkipped: boolean;
  readonly isSkipped: boolean;
  readonly coverage?: CoverageComparison;
};

const MAX_EXAMPLES = 5;
const STRICT_CHANGE_RATIO = 0.2;
const STRICT_MINIMUM_CHANGE = 5;

const EMPTY_HISTORY: RunHistory = { templates: {}, checks: {} };

function templateKey(template: Template): string {
  return `${template.root} :: ${template.relativePath}`;
}

export function loadHistory(path: string): RunHistory {
  if (!existsSync(path)) {
    return EMPTY_HISTORY;
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('templates' in parsed) || !('checks' in parsed)) {
    throw new Error(`${path} is not a corpus run history. Delete it to start a new one.`);
  }
  return parsed as RunHistory;
}

export function writeHistory(path: string, history: RunHistory): void {
  writeFileAtomically(path, `${JSON.stringify(history)}\n`);
}

function fingerprintOf(finding: Finding): string {
  return `${finding.severity}|${finding.line ?? ''}|${finding.message}`;
}

function fingerprintOfChange(change: FixChange): string {
  return `fix||${hashText(change.after)}`;
}

function severityOf(fingerprint: string): Severity {
  return fingerprint.slice(0, fingerprint.indexOf('|')) as Severity;
}

export function recordRun(templates: readonly Template[], runs: readonly CheckRun[]): RunHistory {
  const templateHashes = Object.fromEntries(templates.map((template) => [templateKey(template), hashText(template.source)]));
  const checks = Object.fromEntries(runs.map(({ id, outcome }): [string, CheckHistory] => {
    const fingerprints: Record<string, string[]> = {};
    const add = (template: Template, fingerprint: string) => (fingerprints[templateKey(template)] ??= []).push(fingerprint);
    for (const finding of outcome.findings) {
      add(finding.template, fingerprintOf(finding));
    }
    for (const change of outcome.changes ?? []) {
      add(change.template, fingerprintOfChange(change));
    }
    for (const list of Object.values(fingerprints)) {
      list.sort();
    }
    const coverage = outcome.lineCoverage && Object.fromEntries(templatesToScore(outcome.lineCoverage).map((entry): [string, LineCounts] => [templateKey(entry.template), [entry.lines, entry.uncovered, entry.excused]]));
    return [id, { ...(outcome.skipped !== undefined && { skipped: outcome.skipped }), templates: Object.keys(templateHashes), fingerprints, ...(coverage && { coverage }) }];
  }));
  return { templates: templateHashes, checks };
}

export function mergeHistory(previous: RunHistory, current: RunHistory): RunHistory {
  const checks: Record<string, CheckHistory> = { ...previous.checks };
  for (const [id, check] of Object.entries(current.checks)) {
    const earlier = previous.checks[id];
    if (!earlier) {
      checks[id] = check;
      continue;
    }
    if (check.skipped !== undefined) {
      continue;
    }
    const rerun = new Set(check.templates);
    const keptFingerprints = Object.fromEntries(Object.entries(earlier.fingerprints).filter(([template]) => !rerun.has(template)));
    const keptCoverage = Object.fromEntries(Object.entries(earlier.coverage ?? {}).filter(([template]) => !rerun.has(template)));
    const coverage = check.coverage && { ...keptCoverage, ...check.coverage };
    checks[id] = {
      templates: [...new Set([...earlier.templates, ...check.templates])],
      fingerprints: { ...keptFingerprints, ...check.fingerprints },
      ...(coverage && { coverage }),
    };
  }
  return { templates: { ...previous.templates, ...current.templates }, checks };
}

function countBySeverity(fingerprints: readonly string[]): Counts {
  const counts: Record<Severity, number> = { report: 0, failure: 0, skipped: 0, fix: 0 };
  for (const fingerprint of fingerprints) {
    counts[severityOf(fingerprint)] += 1;
  }
  return counts;
}

function difference(from: readonly string[], to: readonly string[]): string[] {
  const remaining = new Map<string, number>();
  for (const item of to) {
    remaining.set(item, (remaining.get(item) ?? 0) + 1);
  }
  return from.filter((item) => {
    const count = remaining.get(item) ?? 0;
    if (count === 0) {
      return true;
    }
    remaining.set(item, count - 1);
    return false;
  });
}

export function compareRuns(previous: RunHistory, current: RunHistory): CheckComparison[] {
  return Object.entries(current.checks).flatMap(([id, check]): CheckComparison[] => {
    const earlier = previous.checks[id];
    if (!earlier) {
      return [];
    }
    const earlierTemplates = new Set(earlier.templates);
    const comparable = check.templates.filter((template) => earlierTemplates.has(template) && previous.templates[template] === current.templates[template]);
    const added: Example[] = [];
    const removed: Example[] = [];
    const beforeAll: string[] = [];
    const afterAll: string[] = [];
    const coverageBefore: [number, number, number] = [0, 0, 0];
    const coverageAfter: [number, number, number] = [0, 0, 0];
    const hasCoverage = earlier.coverage !== undefined && check.coverage !== undefined;
    for (const template of comparable) {
      const before = earlier.fingerprints[template] ?? [];
      const after = check.fingerprints[template] ?? [];
      beforeAll.push(...before);
      afterAll.push(...after);
      for (const [totals, source] of [[coverageBefore, earlier.coverage], [coverageAfter, check.coverage]] as const) {
        (source?.[template] ?? [0, 0, 0]).forEach((count, position) => {
          totals[position] = (totals[position] ?? 0) + count;
        });
      }
      added.push(...difference(after, before).map((fingerprint) => ({ template, fingerprint })));
      removed.push(...difference(before, after).map((fingerprint) => ({ template, fingerprint })));
    }
    return [{
      id,
      comparableTemplates: comparable.length,
      before: countBySeverity(beforeAll),
      after: countBySeverity(afterAll),
      added,
      removed,
      wasSkipped: earlier.skipped !== undefined,
      isSkipped: check.skipped !== undefined,
      ...(hasCoverage && { coverage: { before: coverageBefore, after: coverageAfter } }),
    }];
  });
}

function isLargeSwing(before: number, after: number): boolean {
  if (before === after) {
    return false;
  }
  if (before === 0 || after === 0) {
    return true;
  }
  return Math.abs(after - before) >= STRICT_MINIMUM_CHANGE && Math.abs(after - before) / before > STRICT_CHANGE_RATIO;
}

export function describeStrictViolations(comparisons: readonly CheckComparison[]): string[] {
  return comparisons.flatMap((comparison) => {
    const { id, before, after } = comparison;
    const violations: string[] = [];
    if (comparison.isSkipped && !comparison.wasSkipped) {
      violations.push(`${id} was skipped this time`);
    }
    if (isLargeSwing(before.report, after.report)) {
      violations.push(`${id} reports went from ${before.report} to ${after.report}`);
    }
    if (isLargeSwing(before.fix, after.fix)) {
      violations.push(`${id} fixed templates went from ${before.fix} to ${after.fix}`);
    }
    if (comparison.coverage && comparison.coverage.after[1] > comparison.coverage.before[1]) {
      violations.push(`${id} lines not read rose from ${comparison.coverage.before[1]} to ${comparison.coverage.after[1]}`);
    }
    if (after.skipped > before.skipped) {
      violations.push(`${id} skipped templates rose from ${before.skipped} to ${after.skipped}`);
    }
    return violations;
  });
}

function describeExample({ template, fingerprint }: Example): string {
  const [severity = '', line = '', ...message] = fingerprint.split('|');
  const location = line === '' ? template : `${template}:${line}`;
  return severity === 'fix' ? `${location}: fix output changed` : `${location}: ${severity} ${message.join('|')}`;
}

export function renderComparison(comparisons: readonly CheckComparison[], strictViolations: readonly string[] | undefined): string {
  const lines = ['', '## Changes since the last run', ''];
  if (comparisons.length === 0) {
    return `${[...lines, 'No earlier run of these checks to compare with.'].join('\n')}\n`;
  }
  lines.push('| Check | Templates compared | Reports | Failures | Fixed | Skipped | Added | Removed |', '|---|---|---|---|---|---|---|---|');
  for (const { id, comparableTemplates, before, after, added, removed } of comparisons) {
    const pair = (severity: Severity) => (before[severity] === after[severity] ? `${after[severity]}` : `${before[severity]} → ${after[severity]}`);
    lines.push(`| ${id} | ${comparableTemplates} | ${pair('report')} | ${pair('failure')} | ${pair('fix')} | ${pair('skipped')} | ${added.length} | ${removed.length} |`);
  }
  const withCoverage = comparisons.filter((comparison) => comparison.coverage !== undefined);
  if (withCoverage.length > 0) {
    lines.push('', '| Line coverage | Score | Lines not read | Lines not scored |', '|---|---|---|---|');
    for (const { id, coverage } of withCoverage) {
      if (!coverage) {
        continue;
      }
      const [beforeLines, beforeUncovered, beforeExcused] = coverage.before;
      const [afterLines, afterUncovered, afterExcused] = coverage.after;
      const scores = [scoreOf(beforeLines, beforeUncovered, beforeExcused), scoreOf(afterLines, afterUncovered, afterExcused)].map(formatScore);
      lines.push(`| ${id} | ${scores[0] === scores[1] ? scores[0] : `${scores[0]} → ${scores[1]}`} | ${beforeUncovered === afterUncovered ? afterUncovered : `${beforeUncovered} → ${afterUncovered}`} | ${beforeExcused === afterExcused ? afterExcused : `${beforeExcused} → ${afterExcused}`} |`);
    }
  }
  for (const { id, added, removed } of comparisons.filter((comparison) => comparison.added.length + comparison.removed.length > 0)) {
    lines.push('', `### ${id}`, '');
    for (const example of added.slice(0, MAX_EXAMPLES)) {
      lines.push(`- added: ${describeExample(example)}`);
    }
    if (added.length > MAX_EXAMPLES) {
      lines.push(`- ... and ${added.length - MAX_EXAMPLES} more added`);
    }
    for (const example of removed.slice(0, MAX_EXAMPLES)) {
      lines.push(`- removed: ${describeExample(example)}`);
    }
    if (removed.length > MAX_EXAMPLES) {
      lines.push(`- ... and ${removed.length - MAX_EXAMPLES} more removed`);
    }
  }
  if (strictViolations && strictViolations.length > 0) {
    lines.push('', '## Strict check failed', '', ...strictViolations.map((violation) => `- ${violation}`), '', 'Review the changes, then run again without --strict to record this run as the new comparison point.');
  }
  return `${lines.join('\n')}\n`;
}
