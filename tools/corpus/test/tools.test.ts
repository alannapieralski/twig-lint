import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import twigParser from 'twig-eslint-parser';
import { describe, expect, it } from 'vitest';
import { canaryRoot, evaluateCanaries, isExpectedCanaryFailure } from '../src/canaries.js';
import { baselineCoverageOf, findingKey, findStaleBaselineKeys, updateBaselineKeys } from '../src/baseline.js';
import { discoverTemplates, loadConfig } from '../src/config.js';
import { formatScore, renderCoverage, scoreOf, summariseCoverage } from '../src/coverage.js';
import { reviewFix } from '../src/fix-invariants.js';
import { applyOnePass } from '../src/fixing.js';
import { compareRuns, describeStrictViolations, mergeHistory, recordRun, renderComparison } from '../src/history.js';
import { createProgressReporter } from '../src/progress.js';
import { ruleChecks } from '../src/rule-checks.js';
import { selectChecks } from '../src/select.js';
import type { Linter, Rule } from 'eslint';
import type { FixKeeps } from '../src/fix-invariants.js';
import type { AppliedFix } from '../src/fixing.js';
import type { CorpusPlugin } from '../src/rule-checks.js';
import type { Check, CheckOutcome, Finding, Template, TemplateCoverage } from '../src/types.js';

function createCorpusDirectory(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'corpus-test-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(directory, name, '..'), { recursive: true });
    writeFileSync(join(directory, name), content);
  }
  return directory;
}

function fixingRule(replaceWith: (source: string) => string, { reportsWhenClean = false } = {}): Rule.RuleModule {
  return {
    meta: { type: 'layout', fixable: 'code', schema: [] },
    create: (context) => ({
      Program: (node) => {
        const { text } = context.sourceCode;
        const replacement = replaceWith(text);
        if (replacement === text && !reportsWhenClean) {
          return;
        }
        context.report({ node, message: 'rewrite', fix: (fixer) => fixer.replaceTextRange([0, text.length], replacement) });
      },
    }),
  };
}

function pluginWith(rules: Record<string, Rule.RuleModule>): CorpusPlugin {
  return {
    rules,
    configs: { recommended: { files: ['**/*.twig'], plugins: { fake: { rules } }, languageOptions: { parser: twigParser } } },
  };
}

function describeFixProblems(source: string, fixed: string, fixKeeps: FixKeeps): string[] {
  return reviewFix(source, fixed, fixKeeps).problems.map((problem) => problem.message);
}

describe('reviewFix', () => {
  it('accepts a change to the whitespace between attributes', () => {
    expect(describeFixProblems('<a  href="x"  id="y">', '<a\n  href="x"\n  id="y">', 'layout')).toEqual([]);
  });

  it('rejects a change inside an attribute value when the rule promises layout only', () => {
    expect(describeFixProblems('<a class="b  c">x</a>', '<a class="b c">x</a>', 'layout')).toEqual([
      'the fix changes more than the whitespace between tokens: "b  c" became "b c"',
    ]);
  });

  it('accepts re-indented lines of text and Twig when the rule promises layout only', () => {
    expect(describeFixProblems('<div>\n{% if a %}\n<b>x</b> y\nz\n{% endif %}\n</div>', '<div>\n  {% if a %}\n    <b>x</b> y\n    z\n  {% endif %}\n</div>', 'layout')).toEqual([]);
  });

  it('accepts a re-indented closing script tag when the rule promises layout only', () => {
    expect(describeFixProblems('<div>\n<script>\n  a();\n</script>\n</div>', '<div>\n  <script>\n  a();\n  </script>\n</div>', 'layout')).toEqual([]);
  });

  it('rejects re-indented lines inside pre, textarea or a Twig span when the rule promises layout only', () => {
    expect(describeFixProblems('<pre>\na\n  b</pre>', '<pre>\na\nb</pre>', 'layout')).toHaveLength(1);
    expect(describeFixProblems('<p>\n{{ "a\n  b" }}\n</p>', '<p>\n{{ "a\nb" }}\n</p>', 'layout')).toHaveLength(1);
    expect(describeFixProblems('<p>\n{{ "a #{ b ~ "c\n  d" } e" }}\n</p>', '<p>\n{{ "a #{ b ~ "c\nd" } e" }}\n</p>', 'layout')).toHaveLength(1);
    expect(describeFixProblems('<p>{{ "x }} y\n  z" }}</p>', '<p>{{ "x }} y\nz" }}</p>', 'layout')).toHaveLength(1);
  });

  it('rejects a change to text when the rule promises layout only', () => {
    expect(describeFixProblems('<a href="x">y</a>', '<a href="x">z</a>', 'layout')).toEqual([
      'the fix changes more than the whitespace between tokens: "y" became "z"',
    ]);
  });

  it('allows other changes when the rule only promises valid code', () => {
    expect(describeFixProblems('<a href="x">', '<a href="y">', 'code')).toEqual([]);
  });

  it('rejects a fix that changes the Twig blocks even when the rule only promises valid code', () => {
    expect(describeFixProblems('{% if a %}b{% endif %}', '{% if a %}b{% endif %}{% if c %}{% endif %}', 'code')[0]).toContain('the fix changes the Twig blocks');
  });

  it('rejects a fix that leaves a template the parser can no longer read', () => {
    const problems = describeFixProblems('<p>x</p>', '<p>{{ </p>', 'code');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no longer parses');
  });
});

describe('applyOnePass', () => {
  const requireFromHere = createRequire(import.meta.url);
  const eslintFixerPath = join(dirname(requireFromHere.resolve('eslint/package.json')), 'lib/linter/source-code-fixer.js');
  const eslintFixer = requireFromHere(eslintFixerPath) as { applyFixes: (text: string, messages: readonly Linter.LintMessage[]) => { output: string } };
  const fixAt = (start: number, end: number, replacement: string): Linter.LintMessage => ({ ruleId: 'r', message: 'm', severity: 1, line: 1, column: 1, fix: { range: [start, end], text: replacement } });

  it.each([
    ['two inserts at the same offset', 'ab', [fixAt(1, 1, '\n'), fixAt(1, 1, '\n')]],
    ['a fix starting where the previous one ends', 'ab', [fixAt(0, 1, 'X'), fixAt(1, 2, 'Y')]],
    ['overlapping fixes', 'abcd', [fixAt(1, 3, 'X'), fixAt(2, 4, 'Y')]],
    ['fixes given out of order', 'abcd', [fixAt(3, 4, 'Y'), fixAt(0, 1, 'X')]],
    ['a reversed range', 'abcd', [fixAt(3, 1, 'X'), fixAt(0, 1, 'Y')]],
    ['a template that starts with a byte order mark', '\uFEFFab', [fixAt(1, 2, 'X')]],
    ['a fix that removes the byte order mark', '\uFEFFab', [fixAt(-1, 0, '')]],
  ])('applies %s exactly as ESLint does', (_, source, messages) => {
    expect(applyOnePass(source, messages).output).toBe(eslintFixer.applyFixes(source, messages).output);
  });

  it('records the text each applied fix replaced, without the byte order mark', () => {
    expect(applyOnePass('\uFEFFab', [fixAt(0, 1, 'X')]).applied).toEqual([{ ruleId: 'r', replaced: 'a', replacement: 'X' }]);
  });
});

describe('ruleChecks', () => {
  const template = (root: string, source = '<p>x</p>'): Template => ({ root, path: join(root, 'a.twig'), relativePath: 'a.twig', source });

  async function failuresOf(rule: Rule.RuleModule, fixKeeps: FixKeeps = 'code'): Promise<readonly Finding[]> {
    const root = createCorpusDirectory({ 'a.twig': '<p>x</p>' });
    const [check] = ruleChecks({ plugin: pluginWith({ rewrite: rule }), prefix: 'fake', rules: { rewrite: { fixKeeps } } });
    if (!check) {
      throw new Error('No check was created.');
    }
    const { findings } = await check.run([template(root)], { roots: new Map(), progress: () => undefined });
    return findings.filter((finding) => finding.severity === 'failure');
  }

  it('creates one check per rule, named after the rule', () => {
    const checks = ruleChecks({ plugin: pluginWith({ one: fixingRule((s) => s), two: fixingRule((s) => s) }), prefix: 'fake', rules: { one: { fixKeeps: 'code' }, two: { fixKeeps: 'code' } } });
    expect(checks.map((check) => check.id)).toEqual(['fake/one', 'fake/two']);
  });

  it('runs a variant of every rule under its own check id, with the variant\'s parser options', async () => {
    const reportsHiddenClasses: Rule.RuleModule = {
      meta: { type: 'problem', schema: [] },
      create: (context) => ({
        Program: (node) => {
          const parserOptions = context.languageOptions.parserOptions as { ignoreInterpolatedAttributes?: readonly string[] } | undefined;
          if (parserOptions?.ignoreInterpolatedAttributes?.includes('class')) {
            context.report({ node, message: 'hides class' });
          }
        },
      }),
    };
    const variant = { name: 'hidden-class', languageOptions: { parserOptions: { ignoreInterpolatedAttributes: ['class'] } } };
    const [check] = ruleChecks({ plugin: pluginWith({ hides: reportsHiddenClasses }), prefix: 'fake', variant });
    if (!check) {
      throw new Error('No check was created.');
    }
    expect([check.id, check.rule]).toEqual(['fake/hides [hidden-class]', 'fake/hides']);
    const root = createCorpusDirectory({ 'a.twig': '<p>x</p>' });
    const { findings } = await check.run([template(root)], { roots: new Map(), progress: () => undefined });
    expect(findings.map((finding) => [finding.severity, finding.message])).toEqual([['report', 'hides class']]);
  });

  it('fails loudly when the settings name a rule the plugin does not have', () => {
    expect(() => ruleChecks({ plugin: pluginWith({ one: fixingRule((s) => s) }), prefix: 'fake', rules: { missing: {} } })).toThrow('missing');
  });

  it('fails loudly when a fixable rule does not say what its fix keeps', () => {
    expect(() => ruleChecks({ plugin: pluginWith({ one: fixingRule((s) => s) }), prefix: 'fake' })).toThrow('fixKeeps');
  });

  it('passes a fix that settles', async () => {
    expect(await failuresOf(fixingRule((source) => source.replace('<p>', '<p class="a">')))).toEqual([]);
  });

  it('catches a fix that keeps changing the template on every pass', async () => {
    const failures = await failuresOf(fixingRule((source) => ` ${source}`));
    expect(failures.map((failure) => failure.message)).toEqual(['the fix does not settle: the template still changes after 10 passes']);
  });

  it('catches a fix that flips between two versions of the template', async () => {
    const failures = await failuresOf(fixingRule((source) => (source.endsWith('\n') ? source.slice(0, -1) : `${source}\n`)));
    expect(failures.map((failure) => failure.message)).toEqual(['the fix oscillates: pass 2 brings back an earlier version of the template']);
  });

  it('catches a fix that does not resolve its own report', async () => {
    const failures = await failuresOf(fixingRule((source) => source, { reportsWhenClean: true }));
    expect(failures.map((failure) => failure.message)).toEqual(['the fix does not resolve its own report: applying it changes nothing and the report stays']);
  });

  it('catches a fix that changes text when the rule promises layout only', async () => {
    const failures = await failuresOf(fixingRule((source) => source.replace('x', 'y')), 'layout');
    expect(failures.map((failure) => failure.message)).toEqual(['the fix changes more than the whitespace between tokens: "x" became "y"']);
  });

  it('lists a template it cannot parse as skipped instead of ignoring it', async () => {
    const source = '<div>\n  {% endif %}';
    const root = createCorpusDirectory({ 'a.twig': source });
    const [check] = ruleChecks({ plugin: pluginWith({ rewrite: fixingRule((s) => s) }), prefix: 'fake', rules: { rewrite: { fixKeeps: 'code' } } });
    if (!check) {
      throw new Error('No check was created.');
    }
    const { findings, stats } = await check.run([template(root, source)], { roots: new Map(), progress: () => undefined });
    expect(findings.map((finding) => [finding.severity, finding.message])).toEqual([['skipped', expect.stringContaining('the template cannot be parsed')]]);
    expect(stats).toMatchObject({ unparseable: 1, reports: 0, withReports: 0 });
  });

  it('lists a template the plugin config ignores as skipped instead of counting it as clean', async () => {
    const root = createCorpusDirectory({ 'a.twig': '<p>x</p>' });
    const plugin = pluginWith({ rewrite: fixingRule((s) => s) });
    const [check] = ruleChecks({ plugin: { ...plugin, configs: { recommended: { ...plugin.configs.recommended, ignores: ['**/a.twig'] } } }, prefix: 'fake', rules: { rewrite: { fixKeeps: 'code' } } });
    if (!check) {
      throw new Error('No check was created.');
    }
    const { findings, stats } = await check.run([template(root)], { roots: new Map(), progress: () => undefined });
    expect(findings.map((finding) => [finding.severity, finding.message])).toEqual([['skipped', 'the plugin config ignores this template']]);
    expect(stats).toMatchObject({ ignored: 1, reports: 0, withReports: 0 });
  });

  it('catches a rule that crashes', async () => {
    const crashing: Rule.RuleModule = { meta: { type: 'problem', schema: [] }, create: () => {
      throw new Error('boom');
    } };
    const failures = await failuresOf(crashing);
    expect(failures[0]?.message).toContain('the rule crashed');
  });
});

describe('selectChecks', () => {
  const check = (id: string, rule?: string): Check => ({ id, ...(rule && { rule }), run: () => ({ findings: [], stats: {} }) });
  const packages = [
    { package: 'parser', checks: [check('parser/lexer')] },
    { package: 'html', checks: [check('twig-html/attrs-newline', 'twig-html/attrs-newline')] },
  ];

  it('selects everything without filters', () => {
    expect(selectChecks(packages, { slow: false })).toHaveLength(2);
  });

  it('leaves slow checks out of an unfiltered run unless asked for', () => {
    const withSlow = [...packages, { package: 'tailwind', checks: [{ ...check('twig-tailwind/config:recommended'), isSlow: true }] }];
    expect(selectChecks(withSlow, { slow: false })).toHaveLength(2);
    expect(selectChecks(withSlow, { slow: true })).toHaveLength(3);
    expect(selectChecks(withSlow, { slow: false, package: 'tailwind' })).toHaveLength(1);
  });

  it('selects a rule by its full id or its short name', () => {
    expect(selectChecks(packages, { slow: false, rule: 'twig-html/attrs-newline' })).toHaveLength(1);
    expect(selectChecks(packages, { slow: false, rule: 'attrs-newline' })).toHaveLength(1);
  });

  it('selects one package', () => {
    expect(selectChecks(packages, { slow: false, package: 'parser' }).map((selected) => selected.check.id)).toEqual(['parser/lexer']);
  });

  it('fails loudly, listing what is available, when nothing matches', () => {
    expect(() => selectChecks(packages, { slow: false, rule: 'nope' })).toThrow('twig-html/attrs-newline');
  });
});

describe('config and discovery', () => {
  it('reads roots from TWIG_CORPUS and finds templates, skipping vendor and node_modules', () => {
    const root = createCorpusDirectory({ 'a.twig': 'a', 'sub/b.html.twig': 'b', 'node_modules/c.twig': 'c', 'vendor/d.twig': 'd', 'e.txt': 'e' });
    const config = loadConfig(tmpdir(), { TWIG_CORPUS: root });
    expect(discoverTemplates(config, { quick: false }).map((found) => found.relativePath)).toEqual(['a.twig', 'sub/b.html.twig']);
  });

  it('says whether the roots came from TWIG_CORPUS, which makes every run partial', () => {
    const root = createCorpusDirectory({ 'a.twig': 'a' });
    expect(loadConfig(tmpdir(), { TWIG_CORPUS: root }).isFromEnvironment).toBe(true);
    const configured = createCorpusDirectory({ 'corpus.config.json': JSON.stringify({ roots: [root] }) });
    expect(loadConfig(configured, {}).isFromEnvironment).toBe(false);
  });

  it('fails loudly when a root does not exist', () => {
    expect(() => loadConfig(tmpdir(), { TWIG_CORPUS: '/definitely/not/here' })).toThrow('do not exist');
  });

  it('fails loudly when there is no config and no environment variable', () => {
    expect(() => loadConfig(createCorpusDirectory({}), {})).toThrow('corpus.config.example.json');
  });

  it('needs a quick root for --quick', () => {
    const root = createCorpusDirectory({ 'a.twig': 'a' });
    expect(() => discoverTemplates(loadConfig(tmpdir(), { TWIG_CORPUS: root }), { quick: true })).toThrow('quick');
  });
});

describe('findingKey', () => {
  const finding = (path: string, source: string): Finding => ({ check: 'c', severity: 'failure', message: 'm', template: { root: '/r', path, relativePath: 'a', source } });

  it('stays the same when a template moves, and changes when its content does', () => {
    expect(findingKey(finding('/one/a.twig', 'same'))).toBe(findingKey(finding('/two/a.twig', 'same')));
    expect(findingKey(finding('/one/a.twig', 'same'))).not.toBe(findingKey(finding('/one/a.twig', 'other')));
  });
});

describe('createProgressReporter', () => {
  function reporterWith(isTerminal: boolean) {
    const written: string[] = [];
    let time = 0;
    const reporter = createProgressReporter({ write: (text) => {
      written.push(text);
    }, isTerminal }, () => time);
    return { reporter, written, advance: (milliseconds: number) => {
      time += milliseconds;
    } };
  }

  it('prints a phase as one prefixed line', () => {
    const { reporter, written } = reporterWith(false);
    reporter.phase('config: 2 roots');
    expect(written).toEqual(['[corpus] config: 2 roots\n']);
  });

  it('prints a line each time a log passes another 10%, with counts and speed', () => {
    const { reporter, written, advance } = reporterWith(false);
    const progress = reporter.track('1/1 a/b', 100);
    advance(2000);
    progress(5, { reports: 1 });
    progress(10, { reports: 3 });
    progress(15, { reports: 4 });
    expect(written).toEqual(['[corpus] 1/1 a/b  10/100 (10%)  reports 3  5 templates/s\n']);
  });

  it('prints a line after 5 seconds even without a new 10% step', () => {
    const { reporter, written, advance } = reporterWith(false);
    const progress = reporter.track('x', 1000);
    advance(5000);
    progress(3);
    expect(written).toHaveLength(1);
  });

  it('prints nothing at the start or the end, which the phase lines cover', () => {
    const { reporter, written, advance } = reporterWith(false);
    const progress = reporter.track('x', 10);
    advance(60_000);
    progress(0);
    progress(10);
    expect(written).toEqual([]);
  });

  it('rewrites one line on a terminal', () => {
    const { reporter, written, advance } = reporterWith(true);
    const progress = reporter.track('x', 100);
    advance(300);
    progress(2);
    expect(written[0]).toMatch(/^\r/);
    expect(written[0]).toContain('\x1b[2K[corpus] x  2/100');
    expect(written[0]).not.toContain('\n');
  });
});

describe('run history', () => {
  const template = (relativePath: string, source = '<p>x</p>'): Template => ({ root: '/r', path: `/r/${relativePath}`, relativePath, source });
  const report = (on: Template, message = 'm', line = 1): Finding => ({ check: 'c', severity: 'report', template: on, message, line });
  const run = (templates: readonly Template[], findings: readonly Finding[], changes: CheckOutcome['changes'] = []) => recordRun(templates, [{ id: 'c', outcome: { findings, stats: {}, changes } }]);

  it('counts what changed on templates that are the same in both runs', () => {
    const [a, b] = [template('a.twig'), template('b.twig')];
    const [comparison] = compareRuns(run([a, b], [report(a), report(b)]), run([a, b], [report(a)]));
    expect(comparison).toMatchObject({ comparableTemplates: 2, before: { report: 2 }, after: { report: 1 }, added: [], removed: [{ template: '/r :: b.twig' }] });
  });

  it('leaves out templates whose content changed between runs', () => {
    const [comparison] = compareRuns(run([template('a.twig')], [report(template('a.twig'))]), run([template('a.twig', '<p>y</p>')], []));
    expect(comparison).toMatchObject({ comparableTemplates: 0, added: [], removed: [] });
  });

  it('notices when a fix produces different output', () => {
    const a = template('a.twig');
    const [comparison] = compareRuns(run([a], [], [{ template: a, before: a.source, after: '<p>y</p>' }]), run([a], [], [{ template: a, before: a.source, after: '<p>z</p>' }]));
    expect(comparison).toMatchObject({ before: { fix: 1 }, after: { fix: 1 } });
    expect(comparison?.added).toHaveLength(1);
  });

  it('keeps the last results of a check that was skipped, so the next run compares with them', () => {
    const a = template('a.twig');
    const skipped = recordRun([a], [{ id: 'c', outcome: { findings: [], stats: {}, skipped: 'needs PHP' } }]);
    const merged = mergeHistory(run([a], [report(a)]), skipped);
    const [comparison] = compareRuns(merged, run([a], [report(a)]));
    expect(comparison).toMatchObject({ before: { report: 1 }, after: { report: 1 }, wasSkipped: false });
    expect(describeStrictViolations(compareRuns(merged, run([a], [report(a)])))).toEqual([]);
  });

  it('keeps earlier results for templates a partial run did not cover', () => {
    const [a, b] = [template('a.twig'), template('b.twig')];
    const merged = mergeHistory(run([a, b], [report(a), report(b)]), run([a], []));
    const [comparison] = compareRuns(merged, run([a, b], [report(b)]));
    expect(comparison).toMatchObject({ before: { report: 1 }, after: { report: 1 }, added: [], removed: [] });
  });

  it('fails a strict run when a rule goes silent, swings, or a check is skipped', () => {
    const templates = Array.from({ length: 30 }, (_, index) => template(`${index}.twig`));
    const before = run(templates, templates.map((each) => report(each)));
    expect(describeStrictViolations(compareRuns(before, run(templates, [])))).toEqual(['c reports went from 30 to 0']);
    expect(describeStrictViolations(compareRuns(before, run(templates, templates.slice(0, 20).map((each) => report(each)))))).toEqual(['c reports went from 30 to 20']);
    expect(describeStrictViolations(compareRuns(before, run(templates, templates.slice(0, 27).map((each) => report(each)))))).toEqual([]);
    const skipped = recordRun(templates, [{ id: 'c', outcome: { findings: templates.map((each) => report(each)), stats: {}, skipped: 'PHP is missing' } }]);
    expect(describeStrictViolations(compareRuns(before, skipped))).toEqual(['c was skipped this time']);
  });
});

describe('line coverage', () => {
  const template = (relativePath: string, root = '/r'): Template => ({ root, path: `${root}/${relativePath}`, relativePath, source: '<p>x</p>' });
  const coverage = (on: Template, lines: number, uncovered: number, excused = 0): TemplateCoverage => ({
    template: on,
    lines,
    uncovered,
    excused,
    spans: uncovered === 0 ? [] : [{ startLine: 3, endLine: 4, label: 'misplaced', detail: 'd', isExcused: false }],
  });
  const record = (entries: readonly TemplateCoverage[]) => recordRun(entries.map((entry) => entry.template), [{ id: 'c', outcome: { findings: [], stats: {}, lineCoverage: entries } }]);

  it('scores the lines read out of the lines that can be scored', () => {
    expect(scoreOf(100, 10, 0)).toBe(90);
    expect(scoreOf(100, 10, 50)).toBe(80);
    expect(scoreOf(10, 0, 10)).toBe(100);
    expect(scoreOf(0, 0, 0)).toBe(100);
  });

  it('never shows 100% while a line is still not read', () => {
    expect(formatScore(scoreOf(131621, 9, 0))).toBe('99.99%');
    expect(formatScore(scoreOf(10, 0, 0))).toBe('100.00%');
  });

  it('adds up templates and leaves the canaries out of the score', () => {
    const entries = [coverage(template('a.twig'), 10, 1), coverage(template('b.twig'), 30, 0, 5), coverage({ ...template('c.twig'), root: canaryRoot }, 4, 4)];
    expect(summariseCoverage(entries)).toMatchObject({ templates: 2, lines: 40, uncovered: 1, excused: 5 });
  });

  it('lists the templates with the most lines not read, with where and why', () => {
    const rendered = renderCoverage('c', [coverage(template('a.twig'), 10, 1), coverage(template('b.twig'), 10, 4)]);
    expect(rendered).toContain('## Line coverage: c');
    expect(rendered.indexOf('b.twig')).toBeLessThan(rendered.indexOf('a.twig'));
    expect(rendered).toContain('4 of 10 lines (3-4 misplaced)');
  });

  it('compares the score on templates that are the same in both runs', () => {
    const a = template('a.twig');
    const [comparison] = compareRuns(record([coverage(a, 10, 4)]), record([coverage(a, 10, 1)]));
    expect(comparison?.coverage).toEqual({ before: [10, 4, 0], after: [10, 1, 0] });
    expect(renderComparison(comparisons(comparison), undefined)).toContain('| c | 60.00% → 90.00% | 4 → 1 | 0 |');
  });

  it('fails a strict run when more lines are not read', () => {
    const a = template('a.twig');
    expect(describeStrictViolations(compareRuns(record([coverage(a, 10, 1)]), record([coverage(a, 10, 2)])))).toEqual(['c lines not read rose from 1 to 2']);
    expect(describeStrictViolations(compareRuns(record([coverage(a, 10, 2)]), record([coverage(a, 10, 1)])))).toEqual([]);
  });

  it('compares against a history written before line coverage existed', () => {
    const a = template('a.twig');
    const earlier = recordRun([a], [{ id: 'c', outcome: { findings: [], stats: {} } }]);
    const [comparison] = compareRuns(earlier, record([coverage(a, 10, 1)]));
    expect(comparison?.coverage).toBeUndefined();
    expect(describeStrictViolations(comparisons(comparison))).toEqual([]);
  });

  it('keeps earlier coverage for templates a partial run did not cover', () => {
    const [a, b] = [template('a.twig'), template('b.twig')];
    const merged = mergeHistory(record([coverage(a, 10, 4), coverage(b, 10, 2)]), record([coverage(a, 10, 1)]));
    const [comparison] = compareRuns(merged, record([coverage(a, 10, 1), coverage(b, 10, 2)]));
    expect(comparison?.coverage).toEqual({ before: [20, 3, 0], after: [20, 3, 0] });
  });
});

function comparisons<Item>(comparison: Item | undefined): Item[] {
  return comparison === undefined ? [] : [comparison];
}

describe('baseline hygiene', () => {
  const key = (check: string, hash: string) => `${check}|${hash}|message`;

  const template = (source: string): Template => ({ root: '/r', path: `/r/${source}`, relativePath: source, source });
  const hashOf = (source: string) => findingKey({ check: 'c', severity: 'failure', message: 'message', template: template(source) }).split('|')[1] as string;
  const [aaa, bbb, ccc] = [hashOf('aaa'), hashOf('bbb'), hashOf('ccc')];
  const coverage = (runs: Parameters<typeof baselineCoverageOf>[0], isFullRun: boolean, sources = ['aaa']) => baselineCoverageOf(runs, sources.map(template), isFullRun);
  const ran = (id: string, findings: readonly Finding[] = []) => ({ id, outcome: { findings, stats: {} } });
  const skippedCheck = (id: string) => ({ id, outcome: { findings: [], stats: {}, skipped: 'needs PHP' } });

  it('finds entries that no longer happen, and on a full run entries whose template is gone', () => {
    const baseline = new Set([key('c', aaa), key('c', bbb), key('other', ccc)]);
    expect(findStaleBaselineKeys(baseline, new Set([key('c', aaa)]), coverage([ran('c')], true))).toEqual([key('c', bbb)]);
    expect(findStaleBaselineKeys(baseline, new Set([key('c', aaa)]), coverage([ran('c')], false))).toEqual([]);
  });

  it('drops exactly the stale entries when updating, and adds the recorded ones', () => {
    const baseline = new Set([key('c', aaa), key('c', bbb), key('other', ccc)]);
    const recorded = new Set([key('c', aaa), key('c', `${aaa}-new`)]);
    const runCoverage = coverage([ran('c')], true);
    const updated = updateBaselineKeys(baseline, recorded, runCoverage);
    expect(updated).toEqual([key('c', aaa), key('other', ccc), key('c', `${aaa}-new`)]);
    expect(findStaleBaselineKeys(new Set(updated), recorded, runCoverage)).toEqual([]);
  });

  it('keeps entries for templates outside a partial run when updating', () => {
    const baseline = new Set([key('c', aaa), key('c', bbb)]);
    expect(updateBaselineKeys(baseline, new Set([key('c', aaa)]), coverage([ran('c')], false))).toEqual([key('c', aaa), key('c', bbb)]);
  });

  it('keeps every entry of a check that was skipped', () => {
    const baseline = new Set([key('parity', aaa), key('parity', bbb)]);
    const runCoverage = coverage([skippedCheck('parity')], true);
    expect(findStaleBaselineKeys(baseline, new Set(), runCoverage)).toEqual([]);
    expect(updateBaselineKeys(baseline, new Set(), runCoverage)).toEqual([key('parity', aaa), key('parity', bbb)]);
  });

  it('keeps the entries of a template that a check skipped', () => {
    const skippedTemplate: Finding = { check: 'c', severity: 'skipped', message: 'no Tailwind', template: template('aaa') };
    const baseline = new Set([key('c', aaa)]);
    expect(updateBaselineKeys(baseline, new Set(), coverage([ran('c', [skippedTemplate])], true))).toEqual([key('c', aaa)]);
  });

  it('keys a failure without the numbers in its message', () => {
    const finding: Finding = { check: 'c', severity: 'failure', template: { root: '/r', path: '/r/a', relativePath: 'a', source: 'x' }, message: 'found 14, markup has 15' };
    expect(findingKey(finding)).toMatch(/\|found #, markup has #$/);
  });
});

describe('canaries', () => {
  const canary: Template = { root: canaryRoot, path: `${canaryRoot}/a.twig`, relativePath: 'a.twig', source: '<p>x</p>\n<p>y</p>' };
  const finding = (severity: Finding['severity'], line: number): Finding => ({ check: 'c', severity, template: canary, message: 'm', line });
  const outcomeOf = (findings: readonly Finding[]): CheckOutcome => ({ findings, stats: {} });
  const expect_ = (entry: Record<string, unknown>) => [{ file: 'a.twig', check: 'c', ...entry }] as unknown as Parameters<typeof evaluateCanaries>[0];

  it('misses an expected report that did not happen', () => {
    expect(evaluateCanaries(expect_({ kind: 'reports', lines: [1, 2] }), 'c', outcomeOf([finding('report', 1)])).missed).toEqual(['canary a.twig:2 expected a report from c']);
  });

  it('misses a clean line that got a finding', () => {
    expect(evaluateCanaries(expect_({ kind: 'clean', lines: 'all' }), 'c', outcomeOf([finding('report', 2)])).missed).toEqual(['canary a.twig expected nothing from c']);
  });

  it('lists a pending expectation instead of failing, and says when it starts passing', () => {
    const pending = expect_({ kind: 'noFailures', lines: 'all', pending: 'later' });
    expect(evaluateCanaries(pending, 'c', outcomeOf([finding('failure', 1)]))).toMatchObject({ missed: [], stillPending: [expect.stringContaining('later')] });
    expect(evaluateCanaries(pending, 'c', outcomeOf([finding('report', 1)]))).toMatchObject({ missed: [], nowPassing: [expect.stringContaining('marked pending')] });
  });

  it('does not call a pending canary passing while the check\'s own canaries are silent', () => {
    const entries = [
      { file: 'a.twig', check: 'c', kind: 'reports', lines: [1] },
      { file: 'a.twig', check: 'c', kind: 'clean', lines: [2], pending: 'later' },
    ] as unknown as Parameters<typeof evaluateCanaries>[0];
    const silent = evaluateCanaries(entries, 'c', outcomeOf([]));
    expect(silent.nowPassing).toEqual([]);
    expect(silent.stillPending).toEqual([expect.stringContaining('cannot be trusted')]);
    expect(evaluateCanaries(entries, 'c', outcomeOf([finding('report', 1)])).nowPassing).toHaveLength(1);
  });

  it('judges no canary of a check that was skipped', () => {
    const skipped: CheckOutcome = { findings: [], stats: {}, skipped: 'needs PHP' };
    expect(evaluateCanaries(expect_({ kind: 'reports', lines: [1] }), 'c', skipped)).toEqual({ missed: [], stillPending: [], nowPassing: [] });
  });

  it('treats failures on a pending or deliberately failing canary as expected', () => {
    expect(isExpectedCanaryFailure(expect_({ kind: 'noFailures', lines: 'all', pending: 'later' }), finding('failure', 2))).toBe(true);
    expect(isExpectedCanaryFailure(expect_({ kind: 'failures', lines: [1] }), finding('failure', 2))).toBe(false);
    expect(isExpectedCanaryFailure(expect_({ kind: 'failures', lines: [1] }), finding('failure', 1))).toBe(true);
  });
});

describe('reviewFix line endings', () => {
  const problemsOf = (source: string, fixed: string) => reviewFix(source, fixed, 'code').problems.map((problem) => problem.message);

  it('fails a fix that adds a kind of line break the template did not have', () => {
    expect(problemsOf('<p>\r\n</p>', '<p>\r\n</p>\n')).toEqual(['the fix adds \\n line breaks to a template that has none']);
    expect(problemsOf('<p>\n</p>', '<p>\n</p>\r\n')).toEqual(['the fix adds \\r\\n line breaks to a template that has none']);
    expect(problemsOf('<p>\n</p>', '<p>\n</p>\r')).toEqual(['the fix adds \\r line breaks to a template that has none']);
  });

  it('accepts a fix that only uses the line breaks the template already has', () => {
    expect(problemsOf('<p>\r\n</p>\n', '<p>\r\n\r\n</p>\n\n')).toEqual([]);
    expect(problemsOf('<p>\r\n</p>', '<p></p>')).toEqual([]);
    expect(problemsOf('<p></p>', '<p>\n</p>')).toEqual([]);
    expect(problemsOf('<p></p>', '<p>\r\n</p>')).toEqual(['the fix adds \\r\\n line breaks to a template that has none']);
  });
});

describe('reviewFix opening tag indentation', () => {
  const problemsOf = (source: string, fixed: string) => reviewFix(source, fixed, 'layout').problems.map((problem) => problem.message);

  it('fails a fix that leaves attribute lines or the closing bracket less indented than the tag line', () => {
    expect(problemsOf('  <a href="#" class="b">x</a>', '  <a\nhref="#"\nclass="b"\n>x</a>')).toEqual(['the fix leaves 3 more lines of opening tags less indented than the tag line']);
  });

  it('accepts attribute lines at or beyond the tag line, and lines that were already less indented', () => {
    expect(problemsOf('  <a href="#" class="b">x</a>', '  <a\n    href="#"\n    class="b"\n  >x</a>')).toEqual([]);
    expect(problemsOf('  <a\nhref="#"\nclass="b">x</a>', '  <a\nhref="#"\nclass="b"\n  >x</a>')).toEqual([]);
  });
});

describe('reviewFix with class-tokens', () => {
  const review = (source: string, fixed: string, applied: AppliedFix[]) => {
    const result = reviewFix(source, fixed, 'class-tokens', applied, {
      rewritesClasses: new Set(['canonical']),
      removesDuplicateClasses: new Set(['dedupe']),
    });
    return { problems: result.problems.map((problem) => problem.message), notes: result.notes.map((note) => note.message) };
  };
  const fix = (ruleId: string, replaced: string, replacement: string): AppliedFix => ({ ruleId, replaced, replacement });

  it('accepts reordering and rewrapping classes inside a group', () => {
    expect(review('<p class="b a">x</p>', '<p class="a b">x</p>', [fix('order', '"b a"', '"\n  a\n  b\n"')])).toEqual({ problems: [], notes: [] });
  });

  it('fails a fix that moves the [ ] and | group delimiters', () => {
    expect(review('<p class="a [ md:b ]">x</p>', '<p class="[ ] a md:b">x</p>', [fix('order', 'a [ md:b ]', '[ ] a md:b')]).problems).toEqual(['order moves classes between the groups that [ ] and | delimit']);
    expect(review('<p class="a [ b ] [ c ]">x</p>', '<p class="a [ b c ]">x</p>', [fix('dedupe', 'a [ b ] [ c ]', 'a [ b c ]')]).problems).toEqual(['dedupe moves or removes class group delimiters: [ ] [ ] became [ ]']);
  });

  it('fails a fix that moves classes across a | delimiter', () => {
    expect(review('<p class="a | b c">x</p>', '<p class="b | a c">x</p>', [fix('order', 'a | b c', 'b | a c')]).problems).toEqual(['order moves classes between the groups that [ ] and | delimit']);
  });

  it('fails a fix that drops a class', () => {
    expect(review('<p class="a b">x</p>', '<p class="a">x</p>', [fix('order', 'a b', 'a')]).problems).toEqual(['order changes the classes: removes b, adds none']);
  });

  it('notes a duplicate removal only when the class really is duplicated', () => {
    expect(review('<p class="a b b">x</p>', '<p class="a b">x</p>', [fix('dedupe', ' b', '')])).toEqual({ problems: [], notes: ['dedupe removes duplicate classes'] });
    expect(review('<p class="a b">x</p>', '<p class="a">x</p>', [fix('dedupe', ' b', '')]).problems).toHaveLength(1);
  });

  it('notes class rewrites from a rule whose job is to rewrite them', () => {
    expect(review('<p class="w-6 h-6">x</p>', '<p class="size-6">x</p>', [fix('canonical', 'w-6 h-6', 'size-6')])).toEqual({ problems: [], notes: ['canonical rewrites classes: w-6 h-6 became size-6'] });
  });

  it('places a problem at the class list the failing fix changed', () => {
    const source = '<p class="a b">x</p>\n<p class="c [ d ]">y</p>';
    const [problem] = reviewFix(source, source.replace('c [ d ]', '[ ] c d'), 'class-tokens', [fix('order', 'c [ d ]', '[ ] c d')]).problems;
    expect(problem?.offset).toBe(source.indexOf('c [ d ]'));
  });

  it('places a layout problem at the token that changed', () => {
    const source = '<p>a</p>\n<a  href="x"  id="y">t</a>';
    const [problem] = reviewFix(source, source.replace('t</a>', 'u</a>'), 'layout').problems;
    expect(problem?.offset).toBe(source.indexOf('t</a>'));
  });

  it('fails a fix that duplicates a class', () => {
    expect(review('<p class="a b">x</p>', '<p class="a b a">x</p>', [fix('order', 'a b', 'a b a')]).problems).toEqual(['order duplicates classes: a']);
    expect(review('<p class="a b b">x</p>', '<p class="a a b">x</p>', [fix('order', 'a b b', 'a a b')]).problems).toEqual(['order duplicates classes: a']);
  });

  it('fails a fix that changes Twig inside a class list', () => {
    expect(review('<p class="a {{ b }}">x</p>', '<p class="a {{b}}">x</p>', [fix('order', 'a {{ b }}', 'a {{b}}')]).problems).toEqual(['order changes Twig inside a class list']);
  });
});
