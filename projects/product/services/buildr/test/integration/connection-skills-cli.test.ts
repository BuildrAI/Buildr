import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('完整连接命令链经过唯一隔离执行器并清理本次现场', t => {
  const service = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  // Keep the compile cache private to this test and clean it with its fixture.
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-connections-compile-'));
  t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ['tools/development/run-isolated-workspace-check.ts', '--script', 'test/fixtures/connection-skills-cli-check.ts'], { cwd: service, env: { ...process.env, NODE_COMPILE_CACHE: cache }, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /"externalSystems":"not-contacted"/);
  assert.match(result.stdout, /"status":"passed"/);
  assert.match(result.stdout, /"cleanup":"cleaned"/);
});
