import { isSelector } from './selector-validation.js';
import type { ClassSelector } from '../selectors/class-selector.js';

export type ConfigOptions = {
  readonly drupal?: boolean;
  readonly selectors?: readonly ClassSelector[];
};

const KNOWN_OPTION_NAMES: ReadonlySet<string> = new Set(['drupal', 'selectors']);

export function parseConfigOptions(options: unknown): Required<ConfigOptions> {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('createConfig() takes an options object, such as { drupal: true }.');
  }

  const unknownNames = Object.keys(options).filter((optionName) => !KNOWN_OPTION_NAMES.has(optionName));
  if (unknownNames.length > 0) {
    throw new TypeError(`createConfig() has no option named ${unknownNames.join(', ')}. Its options are drupal and selectors.`);
  }

  const { drupal = false, selectors = [] } = options as ConfigOptions;
  if (typeof drupal !== 'boolean') {
    throw new TypeError('createConfig() option "drupal" must be true or false.');
  }
  if (!Array.isArray(selectors) || !selectors.every(isSelector)) {
    throw new TypeError('createConfig() option "selectors" must be an array of better-tailwindcss selectors, each with a name pattern (or a path pattern for callee and tag), an optional match array of strings, objectKeys or objectValues matchers, and every pattern a valid regular expression.');
  }

  return { drupal, selectors };
}
