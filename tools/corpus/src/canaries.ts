import { existsSync, globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckOutcome, Finding, Template } from './types.js';

type Kind = 'reports' | 'failures' | 'clean' | 'noFailures';
type Expectation = {
  readonly file: string;
  readonly check: string;
  readonly kind: Kind | 'output';
  readonly lines: readonly number[] | 'all';
  readonly expectedOutputFile?: string;
  readonly pending?: string;
};
export type CanaryResult = { readonly missed: readonly string[]; readonly stillPending: readonly string[]; readonly nowPassing: readonly string[] };

export const canaryRoot = join(import.meta.dirname, '../canaries');
const expectationsPath = join(canaryRoot, 'expectations.json');
const KINDS: readonly Kind[] = ['reports', 'failures', 'clean', 'noFailures'];

function isLineList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((line) => Number.isInteger(line) && line > 0);
}

function parseEntry(file: string, entry: unknown): Expectation[] {
  if (typeof entry !== 'object' || entry === null || typeof (entry as { check?: unknown }).check !== 'string') {
    throw new Error(`${expectationsPath}: each entry for ${file} needs a "check".`);
  }
  const { check, pending, output, ...rest } = entry as { check: string; pending?: unknown; output?: unknown } & Record<string, unknown>;
  if (pending !== undefined && typeof pending !== 'string') {
    throw new Error(`${expectationsPath}: "pending" for ${file} must say why, as a string.`);
  }
  const unknownKeys = Object.keys(rest).filter((key) => !KINDS.includes(key as Kind));
  if (unknownKeys.length > 0) {
    throw new Error(`${expectationsPath}: ${file} has unknown keys ${unknownKeys.join(', ')}.`);
  }
  if (output !== undefined && (typeof output !== 'string' || output.endsWith('.twig') || !existsSync(join(canaryRoot, output)))) {
    throw new Error(`${expectationsPath}: "output" for ${file} must name a file in ${canaryRoot} that does not end in .twig.`);
  }
  const outputExpectation: Expectation[] = output === undefined ? [] : [{ file, check, kind: 'output', lines: 'all', expectedOutputFile: output, ...(pending !== undefined && { pending }) }];
  return [...outputExpectation, ...KINDS.flatMap((kind): Expectation[] => {
    const lines = rest[kind];
    if (lines === undefined) {
      return [];
    }
    if (lines !== 'all' && !isLineList(lines)) {
      throw new Error(`${expectationsPath}: "${kind}" for ${file} must be "all" or a list of line numbers.`);
    }
    return [{ file, check, kind, lines, ...(pending !== undefined && { pending }) }];
  })];
}

export function loadCanaryExpectations(): Expectation[] {
  if (!existsSync(expectationsPath)) {
    return [];
  }
  const raw: unknown = JSON.parse(readFileSync(expectationsPath, 'utf8'));
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${expectationsPath} must map canary file names to lists of expectations.`);
  }
  return Object.entries(raw).flatMap(([file, entries]) => {
    if (!existsSync(join(canaryRoot, file))) {
      throw new Error(`${expectationsPath} names ${file}, which is not in ${canaryRoot}.`);
    }
    if (!Array.isArray(entries)) {
      throw new Error(`${expectationsPath}: ${file} must map to a list of expectations.`);
    }
    return entries.flatMap((entry) => parseEntry(file, entry));
  });
}

export function discoverCanaries(): Template[] {
  return globSync('**/*.twig', { cwd: canaryRoot }).sort().map((file) => ({ root: canaryRoot, path: join(canaryRoot, file), relativePath: file, source: readFileSync(join(canaryRoot, file), 'utf8') }));
}

export function isCanary(template: Template): boolean {
  return template.root === canaryRoot;
}

function describeExpectation(expectation: Expectation, line: number | 'all'): string {
  const wanted = { reports: 'a report', failures: 'a failure', clean: 'nothing', noFailures: 'no failure', output: `its fix to match ${expectation.expectedOutputFile ?? ''}` }[expectation.kind];
  return `canary ${expectation.file}${line === 'all' ? '' : `:${line}`} expected ${wanted} from ${expectation.check}`;
}

function fixedOutputOf(file: string, outcome: CheckOutcome): string {
  const change = (outcome.changes ?? []).find((candidate) => isCanary(candidate.template) && candidate.template.relativePath === file);
  return change?.after ?? readFileSync(join(canaryRoot, file), 'utf8');
}

function meetsExpectation(expectation: Expectation, line: number | 'all', outcome: CheckOutcome): boolean {
  if (expectation.kind === 'output') {
    return fixedOutputOf(expectation.file, outcome) === readFileSync(join(canaryRoot, expectation.expectedOutputFile ?? ''), 'utf8');
  }
  const findings = outcome.findings.filter((finding) => isCanary(finding.template));
  const relevant = findings.filter((finding) => finding.template.relativePath === expectation.file && finding.severity !== 'skipped' && (line === 'all' || finding.line === line));
  switch (expectation.kind) {
    case 'clean':
      return relevant.length === 0;
    case 'noFailures':
      return !relevant.some((finding) => finding.severity === 'failure');
    case 'reports':
      return relevant.some((finding) => finding.severity === 'report');
    case 'failures':
      return relevant.some((finding) => finding.severity === 'failure');
  }
}

function provesTheCheckWorks(expectation: Expectation): boolean {
  return expectation.pending === undefined && (expectation.kind === 'reports' || expectation.kind === 'failures' || expectation.kind === 'output');
}

export function evaluateCanaries(expectations: readonly Expectation[], check: string, outcome: CheckOutcome): CanaryResult {
  if (outcome.skipped !== undefined) {
    return { missed: [], stillPending: [], nowPassing: [] };
  }
  const missed: string[] = [];
  const stillPending: string[] = [];
  const nowPassing: string[] = [];
  const checkExpectations = expectations.filter((candidate) => candidate.check === check);
  const isCheckWorking = checkExpectations.filter(provesTheCheckWorks).every((expectation) =>
    (expectation.lines === 'all' ? ['all' as const] : expectation.lines).every((line) => meetsExpectation(expectation, line, outcome)));
  for (const expectation of checkExpectations) {
    for (const line of expectation.lines === 'all' ? ['all' as const] : expectation.lines) {
      const isMet = meetsExpectation(expectation, line, outcome);
      const description = describeExpectation(expectation, line);
      if (expectation.pending === undefined) {
        if (!isMet) {
          missed.push(description);
        }
      } else if (isMet && isCheckWorking) {
        nowPassing.push(`${description} (marked pending: ${expectation.pending})`);
      } else {
        const unproven = isMet ? '; the check\'s own canaries are not firing, so this cannot be trusted' : '';
        stillPending.push(`${description} (pending: ${expectation.pending}${unproven})`);
      }
    }
  }
  return { missed, stillPending, nowPassing };
}

export function isExpectedCanaryFailure(expectations: readonly Expectation[], finding: Finding): boolean {
  if (!isCanary(finding.template) || finding.severity !== 'failure') {
    return false;
  }
  return expectations.some((expectation) =>
    expectation.check === finding.check
    && expectation.file === finding.template.relativePath
    && (expectation.kind === 'failures' || expectation.pending !== undefined)
    && (finding.line === undefined || expectation.lines === 'all' || expectation.lines.includes(finding.line)));
}
