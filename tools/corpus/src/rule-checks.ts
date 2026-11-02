import { ESLint } from 'eslint';
import { runLintCheck } from './lint-check.js';
import type { Linter, Rule } from 'eslint';
import type { FixKeeps } from './fix-invariants.js';
import type { LintTarget, RootLinter } from './lint-check.js';
import type { Check, Template } from './types.js';

export type RuleCorpusSettings = {
  readonly fixKeeps?: FixKeeps;
};

export type RuleCheckVariant = {
  readonly name: string;
  readonly languageOptions: Linter.LanguageOptions;
};

export type CorpusPlugin = {
  readonly rules: Record<string, Rule.RuleModule>;
  readonly configs: { readonly recommended: Linter.Config };
};

function createLinterPool(configs: readonly Linter.Config[]): (template: Template) => RootLinter {
  const lintersByRoot = new Map<string, ESLint>();
  return ({ root }) => {
    const existing = lintersByRoot.get(root);
    if (existing) {
      return { linter: existing };
    }
    const linter = new ESLint({ cwd: root, overrideConfigFile: true, fix: false, overrideConfig: [...configs] });
    lintersByRoot.set(root, linter);
    return { linter };
  };
}

function createRuleCheck(plugin: CorpusPlugin, prefix: string, ruleName: string, settings: RuleCorpusSettings, variant: RuleCheckVariant | undefined): Check {
  const ruleId = `${prefix}/${ruleName}`;
  const checkId = variant ? `${ruleId} [${variant.name}]` : ruleId;
  const { recommended } = plugin.configs;
  const config: Linter.Config = { ...recommended, rules: { [ruleId]: 'warn' } };
  const target: LintTarget = {
    check: checkId,
    fixKeeps: settings.fixKeeps ?? 'code',
    isOwnMessage: (message) => message.ruleId === ruleId,
    describeMessage: (message) => message.message,
  };
  const configs = variant ? [config, { languageOptions: variant.languageOptions }] : [config];
  return { id: checkId, rule: ruleId, run: (templates, context) => runLintCheck(target, createLinterPool(configs), templates, context) };
}

export function ruleChecks(definition: {
  readonly plugin: CorpusPlugin;
  readonly prefix: string;
  readonly rules?: Readonly<Record<string, RuleCorpusSettings>>;
  readonly variant?: RuleCheckVariant;
}): Check[] {
  const { plugin, prefix, rules = {}, variant } = definition;
  const unknownRules = Object.keys(rules).filter((ruleName) => !(ruleName in plugin.rules));
  if (unknownRules.length > 0) {
    throw new Error(`Corpus settings name rules that ${prefix} does not have: ${unknownRules.join(', ')}`);
  }
  const fixableWithoutPromise = Object.entries(plugin.rules).filter(([ruleName, rule]) => rule.meta?.fixable !== undefined && rules[ruleName]?.fixKeeps === undefined).map(([ruleName]) => ruleName);
  if (fixableWithoutPromise.length > 0) {
    throw new Error(`${prefix} rules ${fixableWithoutPromise.join(', ')} are fixable, so their corpus settings must say what a fix keeps: fixKeeps 'layout', 'class-tokens' or 'code'.`);
  }
  return Object.keys(plugin.rules).map((ruleName) => createRuleCheck(plugin, prefix, ruleName, rules[ruleName] ?? {}, variant));
}
