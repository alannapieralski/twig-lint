import { createRequire } from 'node:module';
import type * as PluginModule from 'eslint-plugin-better-tailwindcss';
import type * as DefaultsModule from 'eslint-plugin-better-tailwindcss/defaults';

type BetterTailwindcss = {
  readonly plugin: (typeof PluginModule)['default'];
  readonly getDefaultSelectors: (typeof DefaultsModule)['getDefaultSelectors'];
};

const { peerDependencies } = createRequire(import.meta.url)('../../package.json') as { peerDependencies: Record<string, string> };
const supportedVersions = peerDependencies['eslint-plugin-better-tailwindcss'];

async function loadBetterTailwindcss(): Promise<BetterTailwindcss> {
  try {
    const [pluginModule, defaultsModule] = await Promise.all([
      import('eslint-plugin-better-tailwindcss'),
      import('eslint-plugin-better-tailwindcss/defaults'),
    ]);
    return { plugin: pluginModule.default, getDefaultSelectors: defaultsModule.getDefaultSelectors };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') {
      throw error;
    }
    throw new Error(
      `eslint-plugin-twig-tailwind could not load eslint-plugin-better-tailwindcss, which it needs as a peer dependency. Install it with: npm install --save-dev "eslint-plugin-better-tailwindcss@${supportedVersions}"`,
      { cause: error },
    );
  }
}

export const betterTailwindcss = await loadBetterTailwindcss();
