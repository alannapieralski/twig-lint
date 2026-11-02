import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomically } from './files.js';
import { hashText } from './hash.js';
import type { CheckOutcome, Finding, Template } from './types.js';

export type BaselineCoverage = {
  readonly isFullRun: boolean;
  readonly checksRun: ReadonlySet<string>;
  readonly templateHashesRun: ReadonlySet<string>;
  readonly skippedTemplates: ReadonlySet<string>;
};

type RunOfCheck = { readonly id: string; readonly outcome: CheckOutcome };

function hashOfTemplate(template: Template): string {
  return hashText(template.source);
}

export function findingKey(finding: Finding): string {
  return `${finding.check}|${hashOfTemplate(finding.template)}|${finding.message.replace(/\d+/g, '#')}`;
}

function templateHashOfKey(key: string): string {
  return key.split('|', 2)[1] ?? '';
}

function checkOfKey(key: string): string {
  return key.split('|', 1)[0] ?? key;
}

function checkAndTemplateOf(key: string): string {
  return `${checkOfKey(key)}|${templateHashOfKey(key)}`;
}

function checkAndTemplateOfFinding(finding: Finding): string {
  return `${finding.check}|${hashOfTemplate(finding.template)}`;
}

export function baselineCoverageOf(runs: readonly RunOfCheck[], templates: readonly Template[], isFullRun: boolean): BaselineCoverage {
  const completedRuns = runs.filter(({ outcome }) => outcome.skipped === undefined);
  const skippedFindings = completedRuns.flatMap(({ outcome }) => outcome.findings.filter((finding) => finding.severity === 'skipped'));

  return {
    isFullRun,
    checksRun: new Set(completedRuns.map(({ id }) => id)),
    templateHashesRun: new Set(templates.map(hashOfTemplate)),
    skippedTemplates: new Set(skippedFindings.map(checkAndTemplateOfFinding)),
  };
}

function isKeyCoveredByTheRun(key: string, coverage: BaselineCoverage): boolean {
  if (!coverage.checksRun.has(checkOfKey(key))) {
    return false;
  }
  if (coverage.skippedTemplates.has(checkAndTemplateOf(key))) {
    return false;
  }
  return coverage.isFullRun || coverage.templateHashesRun.has(templateHashOfKey(key));
}

export function findStaleBaselineKeys(baseline: ReadonlySet<string>, recordedKeys: ReadonlySet<string>, coverage: BaselineCoverage): string[] {
  return [...baseline].filter((key) => !recordedKeys.has(key) && isKeyCoveredByTheRun(key, coverage));
}

export function updateBaselineKeys(baseline: ReadonlySet<string>, recordedKeys: ReadonlySet<string>, coverage: BaselineCoverage): string[] {
  const stale = new Set(findStaleBaselineKeys(baseline, recordedKeys, coverage));
  return [...new Set([...[...baseline].filter((key) => !stale.has(key)), ...recordedKeys])];
}

export function loadBaseline(baselinePath: string): Set<string> {
  if (!existsSync(baselinePath)) {
    return new Set();
  }
  const entries: unknown = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (!Array.isArray(entries)) {
    throw new Error(`${baselinePath} must be a JSON array of finding keys.`);
  }
  return new Set(entries.map(String));
}

export function writeBaseline(baselinePath: string, keys: Iterable<string>): void {
  writeFileAtomically(baselinePath, `${JSON.stringify([...new Set(keys)].sort(), null, 2)}\n`);
}
