import { reviewFix } from './fix-invariants.js';
import { describeFixOutcome, fixUntilSettled } from './fixing.js';
import type { ESLint, Linter } from 'eslint';
import type { ClassRuleRoles, FixKeeps, FixProblem } from './fix-invariants.js';
import type { CheckContext, CheckOutcome, Finding, FixChange, Template } from './types.js';

export type LintTarget = {
  readonly check: string;
  readonly fixKeeps: FixKeeps;
  readonly isOwnMessage: (message: Linter.LintMessage) => boolean;
  readonly describeMessage: (message: Linter.LintMessage) => string;
  readonly classRuleRoles?: ClassRuleRoles;
};
export type RootLinter = { readonly linter: ESLint } | { readonly unavailable: string };

type TemplateInspection = {
  readonly isParseable: boolean;
  readonly reports: readonly Finding[];
  readonly failures: readonly Finding[];
  readonly notes: readonly Finding[];
  readonly skipped?: Finding;
  readonly change?: FixChange;
  readonly passes: number;
};

function describeError(error: unknown, template: Template): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s*Occurred while linting[^\n]*/g, '').replaceAll(template.path, template.relativePath).split('\n')[0] ?? '';
}

async function lintMessages(linter: ESLint, template: Template, source: string): Promise<readonly Linter.LintMessage[]> {
  const [result] = await linter.lintText(source, { filePath: template.path });
  if (!result) {
    throw new Error('ESLint returned no result.');
  }
  return result.messages;
}

function reportOf(target: LintTarget, template: Template, message: Linter.LintMessage): Finding {
  return {
    check: target.check,
    severity: 'report',
    template,
    message: target.describeMessage(message),
    line: message.line,
    column: message.column,
    ...(message.endLine !== undefined && { endLine: message.endLine }),
    ...(message.endColumn !== undefined && { endColumn: message.endColumn }),
  };
}

function lineAtOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function firstChangedLine(before: string, after: string): number | undefined {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const index = beforeLines.findIndex((text, lineIndex) => text !== afterLines[lineIndex]);
  if (index !== -1) {
    return index + 1;
  }
  return beforeLines.length === afterLines.length ? undefined : beforeLines.length;
}

async function inspectTemplate(template: Template, target: LintTarget, linter: ESLint): Promise<TemplateInspection> {
  const messages = await lintMessages(linter, template, template.source);
  const parseError = messages.find((message) => message.fatal);
  if (parseError) {
    const skipped: Finding = { check: target.check, severity: 'skipped', template, message: `the template cannot be parsed: ${parseError.message}`, line: parseError.line };
    return { isParseable: false, reports: [], failures: [], notes: [], skipped, passes: 0 };
  }

  const ownMessages = messages.filter(target.isOwnMessage);
  const reports = ownMessages.map((message) => reportOf(target, template, message));
  if (!ownMessages.some((message) => message.fix)) {
    return { isParseable: true, reports, failures: [], notes: [], passes: 0 };
  }

  const lintOwn = async (code: string) => (await lintMessages(linter, template, code)).filter(target.isOwnMessage);
  const run = await fixUntilSettled(template.source, ownMessages, lintOwn);
  const fixed = run.output;
  const outcomeProblem = describeFixOutcome(run);
  const review = reviewFix(template.source, fixed, target.fixKeeps, run.applied, target.classRuleRoles);
  const problems: FixProblem[] = [
    ...(outcomeProblem ? [{ message: outcomeProblem }] : []),
    ...review.problems,
  ];

  const changedLine = firstChangedLine(template.source, fixed);
  const lineOf = (problem: FixProblem) => (problem.offset === undefined ? changedLine : lineAtOffset(template.source, problem.offset));
  const located = (problem: FixProblem) => {
    const line = lineOf(problem);
    return line === undefined ? {} : { line };
  };
  const failures = problems.map((problem): Finding => ({ check: target.check, severity: 'failure', template, message: problem.message, before: template.source, after: fixed, ...located(problem) }));
  const notes = review.notes.map((note): Finding => ({ check: target.check, severity: 'report', template, message: `fix: ${note.message}`, ...located(note) }));
  const change = fixed === template.source ? undefined : { template, before: template.source, after: fixed };
  return { isParseable: true, reports, failures, notes, passes: run.passes, ...(change && { change }) };
}

export async function runLintCheck(
  target: LintTarget,
  linterFor: (template: Template) => RootLinter,
  templates: readonly Template[],
  context: CheckContext,
): Promise<CheckOutcome> {
  const findings: Finding[] = [];
  const changes: FixChange[] = [];
  const stats = { templates: templates.length, ignored: 0, unavailable: 0, unparseable: 0, withReports: 0, reports: 0, fixed: 0, multiPassFixes: 0 };

  for (const [index, template] of templates.entries()) {
    context.progress(index, { reports: stats.reports, fixed: stats.fixed, skipped: stats.ignored + stats.unavailable + stats.unparseable });
    try {
      const rootLinter = linterFor(template);
      if ('unavailable' in rootLinter) {
        stats.unavailable += 1;
        findings.push({ check: target.check, severity: 'skipped', template, message: rootLinter.unavailable });
        continue;
      }
      if (await rootLinter.linter.isPathIgnored(template.path)) {
        stats.ignored += 1;
        findings.push({ check: target.check, severity: 'skipped', template, message: 'the plugin config ignores this template' });
        continue;
      }
      const inspection = await inspectTemplate(template, target, rootLinter.linter);
      if (!inspection.isParseable) {
        stats.unparseable += 1;
      }
      if (inspection.reports.length > 0) {
        stats.withReports += 1;
      }
      if (inspection.passes > 1) {
        stats.multiPassFixes += 1;
      }
      stats.reports += inspection.reports.length;
      findings.push(...inspection.reports, ...inspection.notes, ...inspection.failures);
      if (inspection.skipped) {
        findings.push(inspection.skipped);
      }
      if (!inspection.change) {
        continue;
      }
      stats.fixed += 1;
      changes.push(inspection.change);
    } catch (error) {
      findings.push({ check: target.check, severity: 'failure', template, message: `the rule crashed: ${describeError(error, template)}` });
    }
  }
  return { findings, stats, changes };
}
