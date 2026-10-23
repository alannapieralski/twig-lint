import { createRequire } from 'node:module';
import type { ESLint } from 'eslint';
import { createConfigFactory } from './configs/create-config.js';
import { createProcessor } from './processors/twig-processor.js';
import { noTwigInterpolation } from './rules/no-twig-interpolation/index.js';

const { name, version } = createRequire(import.meta.url)('../package.json') as { name: string; version: string };

const plugin = {
  meta: { name, version },
  rules: {
    'no-twig-interpolation': noTwigInterpolation,
  },
  processors: { twig: createProcessor({ name, version }) },
} satisfies ESLint.Plugin;

export const createConfig = createConfigFactory(plugin);

export { drupalSelectors } from './selectors/drupal.js';
export { twigSelectors } from './selectors/twig.js';
export type { ClassSelector } from './selectors/class-selector.js';
export type { ConfigOptions } from './configs/config-options.js';
export default Object.assign(plugin, { createConfig, configs: { recommended: createConfig(), drupal: createConfig({ drupal: true }) } });
