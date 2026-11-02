import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function unifiedDiff(before: string, after: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'corpus-diff-'));
  try {
    writeFileSync(join(directory, 'before'), before);
    writeFileSync(join(directory, 'after'), after);
    const result = spawnSync('diff', ['-u', 'before', 'after'], { cwd: directory, encoding: 'utf8' });
    if (result.error) {
      throw result.error;
    }
    return result.stdout;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
