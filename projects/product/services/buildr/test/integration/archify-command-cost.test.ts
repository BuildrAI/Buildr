import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { archifyCostEnvironment } from '../helpers/archify-command-cost.ts';

const file = fileURLToPath(import.meta.url);
const serviceRoot = path.resolve(path.dirname(file), '../..');
const secret = 'archify-cost-secret-sentinel';

function isolatedScenario() {
  const smokeRoot = process.env.BUILDR_SMOKE_ROOT;
  const workspace = process.env.BUILDR_SMOKE_WORKSPACE_ROOT;
  assert.ok(smokeRoot && workspace);
  assert.equal(process.env.BUILDR_APP_DATA_DIR, path.join(smokeRoot, 'app-data'));
  assert.equal(process.env.BUILDR_PRODUCT_DATA_DIR, path.join(smokeRoot, 'product-data'));
  const userHome = path.join(smokeRoot, 'user');
  fs.mkdirSync(userHome, { recursive: true });
  const env = { ...process.env, HOME: userHome, USERPROFILE: userHome, ARCHIFY_TEST_PRIVATE_VALUE: secret };
  const args = [path.join(serviceRoot, 'bin/buildr.mjs'), 'component', 'list', '--target', path.join(workspace, secret), '--json'];
  const baseline = spawnSync(process.execPath, args, { cwd: serviceRoot, env, encoding: 'utf8', timeout: 15_000 });
  assert.equal(baseline.status, 1, 'The real readonly CLI rejects the uninitialized fixture workspace.');
  assert.match(baseline.stderr, /Target is not an initialized Buildr workspace:/u);
  const measured = spawnSync(process.execPath, args, {
    cwd: serviceRoot, env: archifyCostEnvironment({ ...env, BUILDR_ARCHIFY_COST_DIAGNOSTICS: '1' }, 2), encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(measured.status, baseline.status, 'Instrumentation preserves the real readonly CLI status.');
  assert.equal(measured.stdout, baseline.stdout, 'Instrumentation preserves the real readonly CLI stdout.');
  assert.equal(measured.stderr, baseline.stderr, 'Instrumentation preserves the real readonly CLI stderr.');
  assert.ok(Number.isInteger(baseline.status));
  const helper = spawnSync(process.execPath, ['-e', 'process.exit(7)', secret], {
    cwd: serviceRoot, env: archifyCostEnvironment({ ...env, BUILDR_ARCHIFY_COST_DIAGNOSTICS: '1' }, 2), encoding: 'utf8', timeout: 5_000,
  });
  assert.equal(helper.status, 7);
  process.stdout.write(`${JSON.stringify({ baselineStatus: baseline.status, measuredStatus: measured.status, helperStatus: helper.status })}\n`);
}

if (process.argv.includes('--archify-cost-scenario')) {
  isolatedScenario();
} else {
  test('Opted-in readonly CLI writes only closed costs; inherited helper arguments produce no record', { timeout: 40_000 }, () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), `${secret}-`));
    try {
      const result = spawnSync(process.execPath, [path.join(serviceRoot, 'tools/development/run-isolated-workspace-smoke.ts'),
        '--script', file, '--', '--archify-cost-scenario'], {
        cwd: serviceRoot, encoding: 'utf8', timeout: 35_000,
        env: { ...process.env, BUILDR_ARCHIFY_COST_DIAGNOSTICS: '0', BUILDR_DIAGNOSTICS_OUTPUT: output },
      });
      assert.equal(result.status, 0, 'The isolated readonly diagnostic scenario passes.');
      assert.match(result.stdout, /"cleanup":"cleaned"/u);
      const directory = path.join(output, 'archify-cost');
      const files = fs.readdirSync(directory);
      assert.equal(files.length, 1, 'Only the matching CLI process writes a record.');
      const content = fs.readFileSync(path.join(directory, files[0]), 'utf8');
      assert.doesNotMatch(content, /archify-cost-secret-sentinel|PRIVATE_VALUE|NODE_OPTIONS|argv|stdout|stderr|\/Users\/|file:\/\//u);
      const record = JSON.parse(content);
      assert.equal(record.schemaVersion, 'buildr.archify-command-cost/v1');
      assert.equal(record.role, 'component-list');
      assert.equal(record.ordinal, 2);
      assert.ok(Number.isInteger(record.status));
      for (const key of ['observedWallMs', 'cpuUserMs', 'cpuSystemMs', 'observerFailures', 'directDoctorWallMs']) {
        assert.ok(Number.isFinite(record[key]) && record[key] >= 0);
      }
      for (const counter of [...record.git, ...record.fs, ...record.children]) {
        assert.ok(Number.isInteger(counter.count) && counter.count >= 0);
        assert.ok(Number.isFinite(counter.wallMs) && counter.wallMs >= 0);
      }
      if (process.platform !== 'win32') {
        assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
        assert.equal(fs.statSync(path.join(directory, files[0])).mode & 0o777, 0o600);
      }
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  });
}
