import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('explicit development source binding uses the real candidate CLI without changing open under isolation', { timeout: 50_000 }, () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const serviceRoot = path.resolve(directory, '../../../buildr');
  const runner = path.join(serviceRoot, 'tools/development/run-isolated-workspace-smoke.ts');
  const scenario = path.join(directory, 'source-binding-business.smoke.ts');
  assert.ok(fs.statSync(runner).isFile()); assert.ok(fs.statSync(scenario).isFile());
  const child = spawnSync(process.execPath, [runner, '--script', scenario], { cwd: serviceRoot, env: process.env, encoding: 'utf8', timeout: 45_000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const rows = child.stdout.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  const actual = rows.find(row => row.schemaVersion === 'buildr.plugin-source-binding-smoke/v1');
  const execution = rows.find(row => row.schemaVersion === 'buildr.workspace-smoke-run/v1');
  assert.ok(actual); assert.equal(actual.status, 'passed'); assert.equal(actual.queries, 1); assert.deepEqual(actual.effects, []);
  assert.ok(execution); assert.equal(execution.status, 'passed'); assert.equal(execution.cleanup, 'cleaned');
});
