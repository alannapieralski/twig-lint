import { existsSync, globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CorpusOptions, CorpusRoot, TailwindSettings, Template } from './types.js';

export type CorpusConfig = { readonly roots: readonly CorpusRoot[]; readonly exclude: readonly string[]; readonly isFromEnvironment: boolean };

const DEFAULT_EXCLUDED_DIRECTORIES = ['node_modules', 'vendor', '.git'];

const TAILWIND_SETTING_NAMES = ['cwd', 'entryPoint', 'tsconfig'] as const;

function parseTailwindSettings(rootPath: string, value: unknown): TailwindSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`"tailwind" for ${rootPath} must be an object with ${TAILWIND_SETTING_NAMES.join(', ')}.`);
  }
  const unknownNames = Object.keys(value).filter((name) => !(TAILWIND_SETTING_NAMES as readonly string[]).includes(name));
  if (unknownNames.length > 0) {
    throw new Error(`"tailwind" for ${rootPath} has unknown settings: ${unknownNames.join(', ')}.`);
  }
  const settings: Record<string, string> = {};
  for (const name of TAILWIND_SETTING_NAMES) {
    const setting = (value as Record<string, unknown>)[name];
    if (setting === undefined) {
      continue;
    }
    if (typeof setting !== 'string' || setting === '') {
      throw new Error(`"tailwind.${name}" for ${rootPath} must be a path.`);
    }
    settings[name] = resolve(rootPath, setting);
  }
  return settings;
}

function parseRoot(entry: unknown): CorpusRoot {
  if (typeof entry === 'string') {
    return { path: resolve(entry), quick: false };
  }
  if (typeof entry === 'object' && entry !== null && typeof (entry as { path?: unknown }).path === 'string') {
    const { path, quick, tailwind } = entry as { path: string; quick?: unknown; tailwind?: unknown };
    const rootPath = resolve(path);
    return { path: rootPath, quick: quick === true, ...(tailwind !== undefined && { tailwind: parseTailwindSettings(rootPath, tailwind) }) };
  }
  throw new Error(`Each corpus root must be a path string or { "path": "...", "quick": true, "tailwind": { ... } }, got ${JSON.stringify(entry)}.`);
}

function parseConfigFile(configPath: string): CorpusConfig {
  const raw: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
  const { roots, exclude = DEFAULT_EXCLUDED_DIRECTORIES } = raw as { roots?: unknown; exclude?: string[] };
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error(`${configPath} must have a non-empty "roots" array.`);
  }
  return { roots: roots.map(parseRoot), exclude, isFromEnvironment: false };
}

export function loadConfig(repositoryRoot: string, environment: NodeJS.ProcessEnv): CorpusConfig {
  const fromEnvironment = (environment['TWIG_CORPUS'] ?? '').split(':').filter((directory) => directory !== '');
  const config = fromEnvironment.length > 0
    ? { roots: fromEnvironment.map(parseRoot), exclude: DEFAULT_EXCLUDED_DIRECTORIES, isFromEnvironment: true }
    : readLocalConfig(repositoryRoot);

  const missing = config.roots.filter((root) => !existsSync(root.path));
  if (missing.length > 0) {
    throw new Error(`Corpus roots do not exist: ${missing.map((root) => root.path).join(', ')}`);
  }
  return config;
}

function readLocalConfig(repositoryRoot: string): CorpusConfig {
  const configPath = resolve(repositoryRoot, 'corpus.config.json');
  if (!existsSync(configPath)) {
    throw new Error('No corpus config. Copy corpus.config.example.json to corpus.config.json and list your project folders, or set TWIG_CORPUS=dir:dir.');
  }
  return parseConfigFile(configPath);
}

function selectRoots(config: CorpusConfig, options: Pick<CorpusOptions, 'quick' | 'roots'>): readonly CorpusRoot[] {
  let roots = config.roots;
  if (options.quick) {
    roots = roots.filter((root) => root.quick);
    if (roots.length === 0) {
      throw new Error('--quick needs at least one root with "quick": true in corpus.config.json.');
    }
  }
  if (options.roots !== undefined) {
    const filters = options.roots;
    roots = roots.filter((root) => filters.some((filter) => root.path.includes(filter)));
    if (roots.length === 0) {
      throw new Error(`No corpus root matches --roots ${filters.join(',')}.`);
    }
  }
  return roots;
}

export function discoverTemplates(config: CorpusConfig, options: Pick<CorpusOptions, 'quick' | 'roots'>): Template[] {
  const excluded = new Set(config.exclude);
  const templatesByPath = new Map<string, Template>();
  for (const root of selectRoots(config, options)) {
    const files = globSync('**/*.twig', { cwd: root.path, exclude: (name) => excluded.has(name) });
    for (const file of files) {
      const path = resolve(root.path, file);
      if (templatesByPath.has(path)) {
        continue;
      }
      templatesByPath.set(path, { root: root.path, path, relativePath: file, source: readFileSync(path, 'utf8') });
    }
  }
  return [...templatesByPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
