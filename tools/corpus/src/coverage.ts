import { isCanary } from './canaries.js';
import type { TemplateCoverage } from './types.js';

export type CoverageTotals = {
  readonly templates: number;
  readonly lines: number;
  readonly uncovered: number;
  readonly excused: number;
  readonly score: number;
};

const MAX_LISTED_TEMPLATES = 15;
const MAX_LISTED_SPANS_PER_TEMPLATE = 3;

export function scoreOf(lines: number, uncovered: number, excused: number): number {
  const scoredLines = lines - excused;
  return scoredLines === 0 ? 100 : ((scoredLines - uncovered) / scoredLines) * 100;
}

export function formatScore(score: number): string {
  return `${(Math.floor(score * 100) / 100).toFixed(2)}%`;
}

export function templatesToScore(coverage: readonly TemplateCoverage[]): TemplateCoverage[] {
  return coverage.filter((entry) => !isCanary(entry.template));
}

export function summariseCoverage(coverage: readonly TemplateCoverage[]): CoverageTotals {
  const scored = templatesToScore(coverage);
  const lines = scored.reduce((sum, entry) => sum + entry.lines, 0);
  const uncovered = scored.reduce((sum, entry) => sum + entry.uncovered, 0);
  const excused = scored.reduce((sum, entry) => sum + entry.excused, 0);
  return { templates: scored.length, lines, uncovered, excused, score: scoreOf(lines, uncovered, excused) };
}

function describeTemplate(entry: TemplateCoverage): string {
  const spans = entry.spans.filter((span) => !span.isExcused).slice(0, MAX_LISTED_SPANS_PER_TEMPLATE);
  const where = spans.map((span) => `${span.startLine}${span.endLine === span.startLine ? '' : `-${span.endLine}`} ${span.label}`).join('; ');
  return `- ${entry.template.root} :: ${entry.template.relativePath}: ${entry.uncovered} of ${entry.lines} lines (${where})`;
}

export function renderCoverage(id: string, coverage: readonly TemplateCoverage[]): string {
  const scored = templatesToScore(coverage);
  const totals = summariseCoverage(coverage);
  const lines = [
    '',
    `## Line coverage: ${id}`,
    '',
    `${formatScore(totals.score)} of ${totals.lines - totals.excused} scored lines are read correctly in ${totals.templates} templates.`,
    `${totals.uncovered} lines are not. ${totals.excused} more are shown but not scored.`,
    '',
    '| Root | Templates | Lines | Not read | Not scored | Score |',
    '|---|---|---|---|---|---|',
  ];
  for (const [root, entries] of Map.groupBy(scored, (entry) => entry.template.root)) {
    const rootTotals = summariseCoverage(entries);
    lines.push(`| ${root} | ${rootTotals.templates} | ${rootTotals.lines} | ${rootTotals.uncovered} | ${rootTotals.excused} | ${formatScore(rootTotals.score)} |`);
  }
  const worst = scored.filter((entry) => entry.uncovered > 0).sort((first, second) => second.uncovered - first.uncovered).slice(0, MAX_LISTED_TEMPLATES);
  if (worst.length > 0) {
    lines.push('', `Templates with the most lines not read (first ${MAX_LISTED_TEMPLATES}):`, '', ...worst.map(describeTemplate));
  }
  return `${lines.join('\n')}\n`;
}

export function coverageNdjson(id: string, coverage: readonly TemplateCoverage[]): string[] {
  return templatesToScore(coverage).map((entry) => JSON.stringify({
    check: id,
    root: entry.template.root,
    file: entry.template.relativePath,
    lines: entry.lines,
    uncovered: entry.uncovered,
    excused: entry.excused,
    score: scoreOf(entry.lines, entry.uncovered, entry.excused),
    spans: entry.spans,
  }));
}
