import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

test('Kibana real CLI and protected HTTP entries share credentials and configuration in an isolated workspace', { timeout: 90000 }, () => {
  const service = path.resolve(import.meta.dirname, '../..');
  const result = spawnSync(process.execPath, ['tools/development/run-isolated-workspace-smoke.ts', '--script', 'test/helpers/kibana-entry-smoke.ts'], { cwd: service, encoding: 'utf8', timeout: 85000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const outputs = result.stdout.trim().split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  assert.ok(outputs.some(value => value.status === 'passed' && value.checks?.includes('draft-no-save')));
  assert.equal(outputs.at(-1).cleanup, 'cleaned');
});
