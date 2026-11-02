import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baselineCoverageOf, findingKey, findStaleBaselineKeys, loadBaseline, updateBaselineKeys, writeBaseline } from './src/baseline.js';
import { canaryRoot, discoverCanaries, evaluateCanaries, isExpectedCanaryFailure, loadCanaryExpectations } from './src/canaries.js';
import { discoverTemplates, loadConfig } from './src/config.js';
import { compareRuns, describeStrictViolations, loadHistory, mergeHistory, recordRun, renderComparison, writeHistory } from './src/history.js';
import { createProgressReporter, stderrOutput } from './src/progress.js';
import { buildCheckReport, buildCheckReports, renderCanaries, writeReport } from './src/report.js';
import { selectChecks } from './src/select.js';
import type { CheckResult } from './src/report.js';
import type { CorpusOptions, CorpusRoot, PackageCorpus, Template } from './src/types.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const reportDirectory = resolve(repositoryRoot, 'corpus-report');
const baselinePath = resolve(repositoryRoot, 'corpus.baseline.json');
const historyPath = resolve(repositoryRoot, 'corpus.previous-run.json');

function readOptions(): CorpusOptions {
  const raw = process.env['CORPUS_OPTIONS'];
  if (raw === undefined) {
    throw new Error('Run the corpus with npm run corpus, which passes the options.');
  }
  return JSON.parse(raw) as CorpusOptions;
}

const options = readOptions();
const reporter = createProgressReporter(stderrOutput(process.env['CORPUS_TTY'] === '1'));
const packages = Object.values(import.meta.glob<{ default: PackageCorpus }>('../../packages/*/test/corpus.ts', { eager: true })).map((module) => module.default);
const selectedChecks = selectChecks(packages, options);

describe.skipIf(!options.list)('corpus checks', () => {
  it('lists the checks that match', () => {
    console.info(selectedChecks.map(({ package: packageName, check }) => `${packageName}: ${check.id}`).join('\n'));
  });
});

describe.skipIf(options.list)('corpus', () => {
  const baseline = loadBaseline(baselinePath);
  const previousRun = loadHistory(historyPath);
  const canaryExpectations = loadCanaryExpectations();
  const canaryNotes: string[] = [];
  const results: CheckResult[] = [];
  let templates: Template[] = [];
  let roots = new Map<string, CorpusRoot>();
  let isFullRun = false;

  beforeAll(() => {
    const config = loadConfig(repositoryRoot, process.env);
    isFullRun = !config.isFromEnvironment && !options.quick && options.roots === undefined;
    roots = new Map([...config.roots, { path: canaryRoot, quick: true }].map((root) => [root.path, root]));
    templates = [...discoverTemplates(config, options), ...discoverCanaries()];
    expect(templates.length, 'no templates found in the corpus roots').toBeGreaterThan(0);
    const countsByRoot = Map.groupBy(templates, (template) => template.root);
    reporter.phase(`config: ${countsByRoot.size} roots, ${templates.length} templates, ${selectedChecks.length} checks`);
    for (const [root, rootTemplates] of countsByRoot) {
      reporter.phase(`  ${rootTemplates.length} templates in ${root}`);
    }
  });

  const numberedChecks = selectedChecks.map((selected, index) => ({ ...selected, position: `${index + 1}/${selectedChecks.length}` }));

  it.each(numberedChecks)('$check.id', async ({ package: packageName, check, position }) => {
    const label = `${position} ${check.id}`;
    reporter.phase(`${label}: starting`);
    const started = performance.now();
    const outcome = await check.run(templates, { roots, progress: reporter.track(label, templates.length) });
    const result: CheckResult = { package: packageName, check, outcome, seconds: (performance.now() - started) / 1000 };
    results.push(result);
    const report = buildCheckReport(result, baseline, (finding) => isExpectedCanaryFailure(canaryExpectations, finding));
    const canaries = evaluateCanaries(canaryExpectations, check.id, outcome);
    canaryNotes.push(...canaries.missed.map((note) => `- missed: ${note}`), ...canaries.nowPassing.map((note) => `- now passing, remove "pending": ${note}`), ...canaries.stillPending.map((note) => `- pending: ${note}`));
    reporter.phase(report.skipped === undefined
      ? `${label}: done in ${report.seconds.toFixed(1)}s, ${report.reports} reports, ${report.failures} failures (${report.newFailures.length} new)`
      : `${label}: skipped, ${report.skipped}`);
    const problems = [
      ...(options.updateBaseline || report.newFailures.length === 0 ? [] : [`${report.newFailures.length} failures are not in the baseline.`]),
      ...canaries.missed,
    ];
    if (problems.length > 0) {
      throw new Error(`${problems.join('\n')}\nSee corpus-report/summary.md.`);
    }
  });

  afterAll(() => {
    const rootCount = new Set(templates.map((template) => template.root)).size;
    const reports = buildCheckReports(results, baseline, (finding) => isExpectedCanaryFailure(canaryExpectations, finding));
    const checkRuns = results.map(({ check, outcome }) => ({ id: check.id, outcome }));
    const baselineCoverage = baselineCoverageOf(checkRuns, templates, isFullRun);
    const recordedKeys = new Set(results.flatMap(({ outcome }) => outcome.findings.filter((finding) => finding.severity === 'failure').map(findingKey)));
    const staleBaselineKeys = options.updateBaseline ? [] : findStaleBaselineKeys(baseline, recordedKeys, baselineCoverage);

    const currentRun = recordRun(templates, checkRuns);
    const comparisons = compareRuns(previousRun, currentRun);
    const strictViolations = options.strict ? describeStrictViolations(comparisons) : undefined;
    const comparison = renderCanaries(canaryNotes) + renderComparison(comparisons, strictViolations);

    console.info(writeReport(reportDirectory, { results, reports, baseline, templateCount: templates.length, rootCount, sampleSize: options.sample, staleBaselineKeys, comparison, isExpectedFailure: (finding) => isExpectedCanaryFailure(canaryExpectations, finding) }));
    if (options.updateBaseline) {
      writeBaseline(baselinePath, updateBaselineKeys(baseline, recordedKeys, baselineCoverage));
      console.info('Baseline updated: corpus.baseline.json');
    }
    if (strictViolations && strictViolations.length > 0) {
      throw new Error(`The strict check failed:\n${strictViolations.join('\n')}\nSee corpus-report/summary.md.`);
    }
    writeHistory(historyPath, mergeHistory(previousRun, currentRun));
  });
});
