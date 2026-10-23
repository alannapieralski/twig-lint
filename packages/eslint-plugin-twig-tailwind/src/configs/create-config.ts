import type { ESLint, Linter } from 'eslint';
import twigParser from 'twig-eslint-parser';
import { drupalSelectors } from '../selectors/drupal.js';
import { twigSelectors } from '../selectors/twig.js';
import { betterTailwindcss } from './better-tailwindcss.js';
import { parseConfigOptions, type ConfigOptions } from './config-options.js';
import { isAttributeSelector, isStyleVariableSelector } from './default-selectors.js';

export function createConfigFactory(plugin: ESLint.Plugin): (options?: ConfigOptions) => Linter.Config {
  const defaultSelectors = betterTailwindcss.getDefaultSelectors();
  const attributeSelectors = defaultSelectors.filter(isAttributeSelector);
  const classSelectors = [...defaultSelectors.filter((selector) => !isStyleVariableSelector(selector)), ...twigSelectors];

  return (options = {}) => {
    const { drupal, selectors } = parseConfigOptions(options);

    return {
      name: drupal ? 'twig-tailwind/drupal' : 'twig-tailwind/recommended',
      files: ['**/*.twig'],
      plugins: { ...betterTailwindcss.plugin.configs.recommended.plugins, 'twig-tailwind': plugin },
      processor: 'twig-tailwind/twig',
      languageOptions: {
        parser: twigParser,
        parserOptions: { ignoreInterpolatedAttributes: ['class'] },
      },
      settings: {
        'better-tailwindcss': { selectors: [...classSelectors, ...(drupal ? drupalSelectors : []), ...selectors] },
      },
      rules: {
        ...betterTailwindcss.plugin.configs.recommended.rules,
        'better-tailwindcss/enforce-consistent-line-wrapping': ['warn', { selectors: attributeSelectors }],
        'twig-tailwind/no-twig-interpolation': 'error',
        'twig-tailwind/no-unparsed-twig': 'error',
      },
    };
  };
}
