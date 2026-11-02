import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const repositoryRoot = resolve(import.meta.dirname, '../..');

const USAGE = `Usage: npm run corpus -- [options]

  --package <name>     Only the checks of one package, e.g. eslint-plugin-twig-html
  --rule <id>          Only one rule, e.g. twig-html/attrs-newline (or attrs-newline)
  --check <id>         Only one check by its exact id
  --roots <a,b>        Only roots whose path contains one of these strings
  --quick              Only roots marked "quick" in corpus.config.json
  --sample <n>         Write n before/after diffs per fixable rule to corpus-report/samples
  --update-baseline    Record the current failures as known
  --slow               Also run slow checks (whole plugin configs) when no package, rule or check is named
  --strict             Fail when reports or fixes swing against the last run, a check is skipped, or more templates are skipped
  --list               Print the checks that match and stop
`;

const { values } = parseArgs({
  options: {
    package: { type: 'string' },
    rule: { type: 'string' },
    check: { type: 'string' },
    roots: { type: 'string' },
    quick: { type: 'boolean', default: false },
    sample: { type: 'string', default: '0' },
    'update-baseline': { type: 'boolean', default: false },
    strict: { type: 'boolean', default: false },
    slow: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: true,
});

if (values.help) {
  console.info(USAGE);
  process.exit(0);
}

const sample = Number(values.sample);
if (!Number.isInteger(sample) || sample < 0) {
  console.error(`--sample must be a whole number, got ${values.sample}.`);
  process.exit(2);
}

const options = {
  ...(values.package !== undefined && { package: values.package }),
  ...(values.rule !== undefined && { rule: values.rule }),
  ...(values.check !== undefined && { check: values.check }),
  ...(values.roots !== undefined && { roots: values.roots.split(',').filter((root) => root !== '') }),
  quick: values.quick,
  sample,
  updateBaseline: values['update-baseline'],
  strict: values.strict,
  slow: values.slow,
  list: values.list,
};

function run(command: string, args: string[], environment: NodeJS.ProcessEnv): number {
  const result = spawnSync(command, args, { cwd: repositoryRoot, stdio: 'inherit', env: environment });
  return result.status ?? 1;
}

console.error('[corpus] building twig-eslint-parser');
const buildStatus = run('npm', ['run', 'build', '-w', 'twig-eslint-parser', '--silent'], process.env);
if (buildStatus !== 0) {
  process.exit(buildStatus);
}

process.exit(run(
  resolve(repositoryRoot, 'node_modules/.bin/vitest'),
  ['run', '--config', 'tools/corpus/vitest.config.ts'],
  {
    ...process.env,
    CORPUS_OPTIONS: JSON.stringify(options),
    CORPUS_TTY: process.stderr.isTTY ? '1' : '0',
    NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ?? ''} --disable-warning=ESLintIgnoreWarning`.trim(),
  },
));
