import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ESLint } from 'eslint';
import { runLintCheck } from './lint-check.js';
import type { Linter } from 'eslint';
import type { FixKeeps } from './fix-invariants.js';
import type { LintTarget, RootLinter } from './lint-check.js';
import type { Check, CheckContext, CheckOutcome, CorpusRoot, Template } from './types.js';

type TailwindResolution =
  | { readonly settings: { readonly cwd: string; readonly entryPoint?: string; readonly tsconfig?: string }; readonly isFallback: boolean }
  | { readonly unavailable: string };

const OLDEST_SUPPORTED_TAILWIND = [3, 3] as const;
const CONFIGURATION_WARNINGS = /No tailwind css entry point found|No tsconfig found|Tailwind CSS is not installed/;

type TailwindPackage = { readonly path: string; readonly version: string };

function findTailwindPackage(cwd: string): TailwindPackage | undefined {
  for (let directory = cwd; ; directory = dirname(directory)) {
    const path = join(directory, 'node_modules', 'tailwindcss', 'package.json');
    if (existsSync(path)) {
      return { path, version: (JSON.parse(readFileSync(path, 'utf8')) as { version: string }).version };
    }
    if (dirname(directory) === directory) {
      return undefined;
    }
  }
}

function isSupportedTailwind(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > OLDEST_SUPPORTED_TAILWIND[0] || (major === OLDEST_SUPPORTED_TAILWIND[0] && minor >= OLDEST_SUPPORTED_TAILWIND[1]);
}

function resolveTailwind(rootPath: string, root: CorpusRoot | undefined, fallbackCwd: string): TailwindResolution {
  const configured = root?.tailwind ?? {};
  const cwd = configured.cwd ?? (findTailwindPackage(rootPath) ? rootPath : fallbackCwd);
  const tailwind = findTailwindPackage(cwd);
  if (tailwind === undefined) {
    return { unavailable: `Tailwind CSS cannot be found from ${cwd}. Set "tailwind.cwd" for this root in corpus.config.json.` };
  }
  if (!isSupportedTailwind(tailwind.version)) {
    return { unavailable: `Tailwind CSS ${tailwind.version} is older than ${OLDEST_SUPPORTED_TAILWIND.join('.')}, which better-tailwindcss cannot load.` };
  }
  for (const setting of ['entryPoint', 'tsconfig'] as const) {
    const path = configured[setting];
    if (path !== undefined && !existsSync(path)) {
      return { unavailable: `"tailwind.${setting}" for this root does not exist: ${path}` };
    }
  }
  const isFallback = root?.tailwind === undefined && tailwind.path === findTailwindPackage(fallbackCwd)?.path;
  return { settings: { cwd, ...(configured.entryPoint && { entryPoint: configured.entryPoint }), ...(configured.tsconfig && { tsconfig: configured.tsconfig }) }, isFallback };
}

function betterTailwindSettings(configs: readonly Linter.Config[]): Record<string, unknown> {
  return Object.assign({}, ...configs.map((config) => (config.settings?.['better-tailwindcss'] ?? {}) as Record<string, unknown>));
}

function createTailwindLinterPool(configs: readonly Linter.Config[], context: CheckContext, fallbackCwd: string): { readonly linterFor: (template: Template) => RootLinter; readonly fallbackRoots: Set<string> } {
  const linterByRoot = new Map<string, RootLinter>();
  const fallbackRoots = new Set<string>();
  const linterFor = ({ root }: Template): RootLinter => {
    const existing = linterByRoot.get(root);
    if (existing) {
      return existing;
    }
    const resolution = resolveTailwind(root, context.roots.get(root), fallbackCwd);
    if ('unavailable' in resolution) {
      linterByRoot.set(root, resolution);
      return resolution;
    }
    if (resolution.isFallback) {
      fallbackRoots.add(root);
    }
    const tailwindSettings: Linter.Config = { files: ['**/*.twig'], settings: { 'better-tailwindcss': { ...betterTailwindSettings(configs), ...resolution.settings } } };
    const linter = { linter: new ESLint({ cwd: root, overrideConfigFile: true, fix: false, overrideConfig: [...configs, tailwindSettings] }) };
    linterByRoot.set(root, linter);
    return linter;
  };
  return { linterFor, fallbackRoots };
}

function countReportsByRule(outcome: CheckOutcome): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of outcome.findings) {
    if (finding.severity !== 'report' || finding.message.startsWith('fix: ')) {
      continue;
    }
    const rule = finding.message.slice(0, finding.message.indexOf(':'));
    counts[rule] = (counts[rule] ?? 0) + 1;
  }
  return counts;
}

async function runConfigCheck(target: LintTarget, configs: readonly Linter.Config[], fallbackCwd: string, templates: readonly Template[], context: CheckContext): Promise<CheckOutcome> {
  const { linterFor, fallbackRoots } = createTailwindLinterPool(configs, context, fallbackCwd);
  const outcome = await runLintCheck(target, linterFor, templates, context);
  const misconfigured = outcome.findings.filter((finding) => finding.severity === 'report' && CONFIGURATION_WARNINGS.test(finding.message) && !fallbackRoots.has(finding.template.root));
  return {
    ...outcome,
    findings: [
      ...outcome.findings,
      ...misconfigured.map((finding) => ({ ...finding, severity: 'failure' as const, message: `better-tailwindcss is not configured for this root: ${finding.message}` })),
    ],
    stats: { ...outcome.stats, rootsOnFallbackTailwind: fallbackRoots.size, ...countReportsByRule(outcome) },
  };
}

function firstLine(text: string): string {
  return text.split('\n')[0] ?? text;
}

export function configChecks(definition: {
  readonly prefix: string;
  readonly configs: Readonly<Record<string, readonly Linter.Config[]>>;
  readonly fixKeeps: FixKeeps;
  readonly fallbackTailwindCwd: string;
  readonly rulesThatRewriteClasses?: readonly string[];
  readonly rulesThatRemoveDuplicateClasses?: readonly string[];
}): Check[] {
  return Object.entries(definition.configs).map(([name, configs]): Check => {
    const target: LintTarget = {
      check: `${definition.prefix}/config:${name}`,
      fixKeeps: definition.fixKeeps,
      classRuleRoles: { rewritesClasses: new Set(definition.rulesThatRewriteClasses), removesDuplicateClasses: new Set(definition.rulesThatRemoveDuplicateClasses) },
      isOwnMessage: (message) => message.ruleId !== null,
      describeMessage: (message) => {
        const warning = CONFIGURATION_WARNINGS.exec(message.message)?.[0];
        return `${message.ruleId ?? 'eslint'}: ${firstLine(message.message)}${warning === undefined ? '' : ` [better-tailwindcss warns: ${warning}]`}`;
      },
    };
    return { id: target.check, isSlow: true, run: (templates, context) => runConfigCheck(target, configs, definition.fallbackTailwindCwd, templates, context) };
  });
}
