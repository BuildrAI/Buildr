import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('independent authoring guide produces a complete unknown skill used through actual isolated CLI registration and run', t => {
  const service = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  // Repeated real CLI processes share compiled code, never workspace state.
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-authoring-compile-'));
  t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ['tools/development/run-isolated-workspace-check.ts', '--script', 'test/fixtures/connection-authoring-cli-check.ts'], { cwd: service, env: { ...process.env, NODE_COMPILE_CACHE: cache }, encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /"authoringGuide":"connection-authoring"/);
  assert.match(result.stdout, /"externalSystems":"not-contacted"/);
  assert.match(result.stdout, /"cleanup":"cleaned"/);
});
