import type { Check, CorpusOptions, PackageCorpus } from './types.js';

export type SelectedCheck = { readonly package: string; readonly check: Check };

function matchesRule(check: Check, rule: string): boolean {
  return check.rule === rule || check.rule?.endsWith(`/${rule}`) === true;
}

export function selectChecks(packages: readonly PackageCorpus[], options: Pick<CorpusOptions, 'package' | 'rule' | 'check' | 'slow'>): SelectedCheck[] {
  const everyCheck = packages.flatMap((corpus) => corpus.checks.map((check) => ({ package: corpus.package, check })));
  const isFiltered = options.package !== undefined || options.rule !== undefined || options.check !== undefined;
  const selected = everyCheck.filter(({ package: packageName, check }) =>
    (isFiltered || options.slow || check.isSlow !== true)
    && (options.package === undefined || packageName === options.package)
    && (options.rule === undefined || matchesRule(check, options.rule))
    && (options.check === undefined || check.id === options.check));
  if (selected.length > 0) {
    return selected;
  }
  throw new Error(`No check matches the given filters. Available checks:\n${everyCheck.map(({ package: packageName, check }) => `  ${packageName}: ${check.id}`).join('\n')}`);
}
