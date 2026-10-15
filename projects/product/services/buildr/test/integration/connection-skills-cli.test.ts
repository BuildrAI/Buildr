import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('完整连接命令链经过唯一隔离执行器并清理本次现场', () => {
  const service = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const result = spawnSync(process.execPath, ['tools/development/run-isolated-workspace-smoke.ts', '--script', 'test/fixtures/connection-skills-cli-smoke.ts'], { cwd: service, encoding: 'utf8', timeout: 90_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /"externalSystems":"not-contacted"/);
  assert.match(result.stdout, /"status":"passed"/);
  assert.match(result.stdout, /"cleanup":"cleaned"/);
});
