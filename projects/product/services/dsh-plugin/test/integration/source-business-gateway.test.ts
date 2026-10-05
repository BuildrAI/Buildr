import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('actual capture queries Buildr metadata while later event viewing runs zero source processes', { timeout: 60_000 }, () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const buildrRoot = path.resolve(directory, '../../../buildr');
  const runner = path.join(buildrRoot, 'tools/development/run-isolated-workspace-smoke.ts');
  const scenario = path.join(directory, 'source-business-gateway.smoke.ts');
  assert.ok(fs.statSync(runner).isFile()); assert.ok(fs.statSync(scenario).isFile());
  const result = spawnSync(process.execPath, [runner, '--script', scenario], { cwd: buildrRoot, env: process.env, encoding: 'utf8', timeout: 55_000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const rows = result.stdout.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  const business = rows.find(row => row.schemaVersion === 'buildr.plugin-source-business-smoke/v1');
  const execution = rows.find(row => row.schemaVersion === 'buildr.workspace-smoke-run/v1');
  assert.ok(business); assert.equal(business.status, 'passed'); assert.equal(business.queries, 5); assert.deepEqual(business.effects, []);
  console.log(JSON.stringify({ schemaVersion: 'buildr.source-gateway-timing/v1', queryDurationMs: business.queryDurationMs }));
  assert.ok(execution); assert.equal(execution.status, 'passed'); assert.equal(execution.cleanup, 'cleaned');
});
