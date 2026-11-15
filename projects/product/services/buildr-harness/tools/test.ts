import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const tests: string[] = [];
function collect(directory: string): void {
  if (!fs.existsSync(directory)) return;
  for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) collect(file);
    else if (item.isFile() && /\.test\.(?:ts|mjs)$/u.test(item.name)) tests.push(file);
  }
}
collect(path.join(root, 'test'));
if (tests.length === 0) throw new Error('agent_test_entries_missing');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
