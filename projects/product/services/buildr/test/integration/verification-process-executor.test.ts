import assert from 'node:assert/strict';
import test from 'node:test';
import process from 'node:process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { executeVerificationCommand } from '../verification/support/process-executor.ts';

test('formal command executor returns passed with clean owned cleanup', async () => {
  const result: any = await executeVerificationCommand({ name: 'process-success', command: { argv: [process.execPath, '-e', 'process.stdout.write("ok")'], timeoutMs: 1_000 } });
  assert.equal(result.status, 'passed');
  assert.equal(result.stdout, 'ok');
  assert.equal(result.processCleanup.status, 'clean');
});

test('formal command executor bounds a process that ignores normal completion', async () => {
  const result: any = await executeVerificationCommand({ name: 'process-timeout', command: { argv: [process.execPath, '-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'], timeoutMs: 1_000 } }, { terminationGraceMs: 20, terminationConfirmMs: 200 });
  assert.equal(result.status, 'timed-out');
  assert.equal(result.failureCode, 'capability-timeout');
  assert.equal(result.exitCode, 124);
  assert.equal(result.processCleanup.status, 'clean');
});

test('Integration progress preserves real Node failure status and reports every fixture file', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-integration-reporter-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const passing = path.join(root, 'passing.test.mjs');
  const failing = path.join(root, 'failing.test.mjs');
  fs.writeFileSync(passing, "import test from 'node:test'; test('passing boundary', () => {});\n");
  fs.writeFileSync(failing, "import test from 'node:test'; import assert from 'node:assert/strict'; test('failing boundary', () => assert.equal(1, 2));\n");
  const reporter = pathToFileURL(path.resolve(import.meta.dirname, '../verification/integration-progress-reporter.ts')).href;
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', `--test-reporter=${reporter}`, passing, failing], {
    encoding: 'utf8', timeout: 10_000, env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  const lines = result.stdout.trim().split('\n').map(line => JSON.parse(line.replace('[buildr-integration-progress] ', '')));
  assert.deepEqual(lines.filter(line => line.status === 'started').map(line => line.file).sort(), ['failing.test.mjs', 'passing.test.mjs']);
  assert.equal(lines.find(line => line.name === 'failing boundary')?.error.causeCode, 'ERR_ASSERTION');
  assert.equal(lines.find(line => line.name === 'failing.test.mjs' && line.status === 'failed')?.status, 'failed');
  assert.equal(lines.find(line => line.name === 'passing.test.mjs' && line.status === 'passed')?.status, 'passed');
  assert.doesNotMatch(result.stdout, /expected|actual|AssertionError|1 !== 2/);
});

test('Real Archify child timeout exposes only the last fixed scenario phase and native code', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-archify-timeout-reporter-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixture = path.join(root, 'archify-component.test.ts');
  const childSource = "process.stderr.write('secret-child-output\\n[archify-scenario] 17: start installed renderer\\n'); setInterval(() => {}, 1000);";
  fs.writeFileSync(fixture, [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { spawnSync } from 'node:child_process';",
    "test('Archify child timeout boundary', () => {",
    `  const result = spawnSync(process.execPath, ['-e', ${JSON.stringify(childSource)}], { encoding: 'utf8', timeout: 3000 });`,
    "  assert.equal(result.status, 0, `${result.error?.message ?? ''}\\n${result.stdout}\\n${result.stderr}`);",
    "});",
  ].join('\n'));
  const reporter = pathToFileURL(path.resolve(import.meta.dirname, '../verification/integration-progress-reporter.ts')).href;
  const result = spawnSync(process.execPath, ['--test', `--test-reporter=${reporter}`, fixture], {
    encoding: 'utf8', timeout: 15_000, env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  const lines = result.stdout.trim().split('\n').map(line => JSON.parse(line.replace('[buildr-integration-progress] ', '')));
  const failure = lines.find(line => line.name === 'Archify child timeout boundary' && line.status === 'failed');
  assert.equal(failure?.error.causeCode, 'ERR_ASSERTION');
  assert.equal(failure?.error.childErrorCode, 'ETIMEDOUT');
  assert.deepEqual(failure?.error.lastPhase, { scope: 'archify', step: 17, status: 'started', operation: 'installed-renderer' });
  assert.doesNotMatch(result.stdout, /secret-child-output|spawnSync|setInterval|AssertionError/);
  assert.equal(result.stdout.includes(root), false);
  assert.equal(result.stdout.includes(process.execPath), false);
});

test('Real failed file and earlier test identities remain visible before a file timeout', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-integration-timeout-reporter-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const blocked = path.join(root, 'a-blocked.test.mjs');
  const failing = path.join(root, 'b-failing.test.mjs');
  fs.writeFileSync(blocked, "import test from 'node:test'; import assert from 'node:assert/strict'; test('named assertion boundary', () => assert.equal(1, 2)); test('blocked boundary', async () => await new Promise(resolve => setTimeout(resolve, 3000)));\n");
  fs.writeFileSync(failing, "import test from 'node:test'; import assert from 'node:assert/strict'; test('failure before timeout', () => assert.equal(1, 2));\n");
  const reporter = pathToFileURL(path.resolve(import.meta.dirname, '../verification/integration-progress-reporter.ts')).href;
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', '--test-timeout=2000', `--test-reporter=${reporter}`, blocked, failing], {
    encoding: 'utf8', timeout: 15_000, env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  const lines = result.stdout.trim().split('\n').map(line => JSON.parse(line.replace('[buildr-integration-progress] ', '')));
  const failureIndex = lines.findIndex(line => line.name === 'b-failing.test.mjs' && line.status === 'failed' && line.error?.exitCode === 1);
  const timeoutIndex = lines.findIndex(line => line.name === 'blocked boundary' && line.error?.failureType === 'testTimeoutFailure');
  assert.ok(failureIndex >= 0, 'the real failed file must retain its name and exit code');
  assert.ok(timeoutIndex > failureIndex, 'an unfinished earlier file must not hide a completed failed file until timeout');
  assert.ok(lines.some(line => line.name === 'failure before timeout' && line.error?.causeCode === 'ERR_ASSERTION'));
  const namedFailureIndex = lines.findIndex(line => line.name === 'named assertion boundary' && line.error?.causeCode === 'ERR_ASSERTION');
  assert.ok(namedFailureIndex >= 0);
  assert.ok(timeoutIndex > namedFailureIndex, 'a later timeout must not erase an earlier failed test name');
});
