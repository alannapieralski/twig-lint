import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const vendorScript = resolve(import.meta.dirname, '../../scripts/vendor.ts');
const shippedTagNameKeys = resolve(import.meta.dirname, '../../src/es-html-parser/utils/tag-name.ts');
const temporaryDirectories: string[] = [];

function createGitRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), 'vendor-test-'));
  temporaryDirectories.push(directory);
  execFileSync('git', ['init', '-q'], { cwd: directory });
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('scripts/vendor.ts --workspace', () => {
  it('applies every patch to a workspace inside another git repository', () => {
    const workspace = join(createGitRepository(), 'workspace');
    execFileSync(process.execPath, [vendorScript, '--workspace', 'es-html-parser', workspace], { stdio: 'pipe' });

    const patchedTagNameKeys = join(workspace, 'src/utils/tag-name.ts');
    expect(existsSync(patchedTagNameKeys)).toBe(true);
    expect(readFileSync(patchedTagNameKeys, 'utf8')).toBe(readFileSync(shippedTagNameKeys, 'utf8'));
  });
});

describe('scripts/vendor.ts --test es-html-parser', () => {
  it('compares every upstream snapshot instead of writing or dropping any', () => {
    const output = execFileSync(process.execPath, [vendorScript, '--test', 'es-html-parser'], { encoding: 'utf8', env: { ...process.env, CI: '', FORCE_COLOR: '0', NO_COLOR: '1' } });
    expect(output).toMatch(/Tests\s+\d+ passed/);
    expect(output).not.toMatch(/failed|written|obsolete/);
  }, 60_000);
});
