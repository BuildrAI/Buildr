import assert from 'node:assert/strict';
import test from 'node:test';
import process from 'node:process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { executeVerificationCommand } from '../verification/support/process-executor.ts';
import { spawnSupervised, parseSuccessfulJson } from '../helpers/child-process-supervisor.ts';
import { stopOwnedChildProcess } from '../verification/support/owned-process.ts';
import { createVerificationExecutor } from '../verification/executor.ts';

test('unexpected preparation failure leaves its dependent command unexecuted', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-preparation-error-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const diagnostics = path.join(root, 'not-a-directory');
  const marker = path.join(root, 'must-not-execute');
  fs.writeFileSync(diagnostics, 'occupied by a file');
  const execute = createVerificationExecutor({ productRoot: root, projectRoot: root, minimumNodeVersion: null,
    diagnosticsDirectory: diagnostics, env: { NODE_TEST_CONTEXT: undefined } });
  const result = await execute({ id: 'dependent', name: 'Dependent command',
    preparations: [{ file: process.execPath, args: ['-e', 'process.exit(0)'], cwd: root }],
    executor: { type: 'command', file: process.execPath,
      args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed')`], cwd: root } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.durationMs, 0);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(result.preparations[0].status, 'failed');
  assert.ok(result.preparations[0].errorCode);
  assert.match(result.reason, /Required preparation prepare-1 failed/);
});

test('supervised output stays bounded while receiving data and preserves the head and failure tail', async () => {
  let largestObserved = 0;
  const execution = spawnSupervised(process.execPath, ['-e', `
process.stdout.write('START\\n' + 'x'.repeat(2 * 1024 * 1024) + '\\nEND\\n');
process.stderr.write('ERROR-START\\n' + 'y'.repeat(2 * 1024 * 1024) + '\\nERROR-END\\n');
`], { outputLimit: 1024, readiness: (stdout: string) => {
    largestObserved = Math.max(largestObserved, Buffer.byteLength(stdout));
    return stdout.includes('END');
  } });
  const result = await execution.completed;
  assert.equal(result.exitCode, 0);
  assert.ok(largestObserved <= 1152, `live output retained ${largestObserved} bytes`);
  for (const [output, head, tail] of [[result.stdout, 'START\n', 'END\n'], [result.stderr, 'ERROR-START\n', 'ERROR-END\n']]) {
    assert.ok(Buffer.byteLength(output) <= 1152);
    assert.ok(output.startsWith(head));
    assert.ok(output.endsWith(tail));
    assert.match(output, /truncated/);
  }
});

async function waitForFile(file: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (fs.existsSync(file)) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`fixture did not create ${file}`);
}

for (const mode of ['timeout', 'cancel', 'parent-exit']) test(`supervised ${mode} reaps owned descendants and preserves an unrelated process`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-supervisor-proof-'));
  const pidFile = path.join(root, 'descendant.json');
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  t.after(async () => { await stopOwnedChildProcess(unrelated); fs.rmSync(root, { recursive: true, force: true }); });
  const controller = new AbortController();
  const execution = spawnSupervised(process.execPath, ['-e', `
const { spawn } = require('node:child_process');
const fs = require('node:fs');
process.on('SIGTERM', () => {});
const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'inherit', 'inherit'] });
fs.writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ pid: child.pid }));
${mode === 'parent-exit' ? 'setTimeout(() => process.exit(0), 150);' : 'setInterval(() => {}, 1000);'}
`], { timeoutMs: mode === 'timeout' ? 300 : 5000, signal: controller.signal, terminationGraceMs: 20, terminationConfirmMs: 500 });
  let guardFired = false;
  const guard = setTimeout(() => {
    guardFired = true;
    execution.child.kill('SIGKILL');
    if (fs.existsSync(pidFile)) {
      try { process.kill(JSON.parse(fs.readFileSync(pidFile, 'utf8')).pid, 'SIGKILL'); } catch {}
    }
  }, 1500);
  t.after(() => clearTimeout(guard));
  await waitForFile(pidFile);
  if (mode === 'cancel') {
    await new Promise(resolve => setTimeout(resolve, 100));
    controller.abort();
  }
  const result = await execution.completed;
  clearTimeout(guard);
  assert.equal(guardFired, false, 'supervisor must finish without the independent test watchdog');
  assert.equal(result.processCleanup.status, 'clean');
  assert.equal(result.timedOut, mode === 'timeout');
  assert.equal(result.cancelled, mode === 'cancel');
  if (mode === 'parent-exit') assert.equal(result.exitCode, 0);
  assert.equal(unrelated.exitCode, null);
  assert.doesNotThrow(() => process.kill(unrelated.pid!, 0));
  const { pid } = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
  assert.throws(() => process.kill(pid, 0), (error: any) => error.code === 'ESRCH');
});

test('supervised spawn failure resolves and cannot be parsed as a successful command', async () => {
  const result = await spawnSupervised(path.join(os.tmpdir(), 'buildr-no-such-executable'), []).completed;
  assert.notEqual(result.exitCode, 0);
  assert.throws(() => parseSuccessfulJson(result), /failed/);
});

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
  const childSource = [
    'const startedAt = performance.now();',
    "process.stderr.write('secret-child-output\\n[archify-scenario] 17: start installed renderer\\n');",
    "process.stderr.write('[archify-scenario-timing] ' + JSON.stringify({ step: 17, operation: 'installed-renderer', status: 'started', elapsedMs: Math.round(performance.now() - startedAt) }) + '\\n');",
    'setInterval(() => {}, 1000);',
  ].join(' ');
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
  const { elapsedMs, ...phase } = failure?.error.lastPhase ?? {};
  assert.deepEqual(phase, { scope: 'archify', step: 17, status: 'started', operation: 'installed-renderer' });
  assert.ok(Number.isInteger(elapsedMs) && elapsedMs >= 0 && elapsedMs <= 300_000);
  assert.deepEqual(failure?.error.phaseTimings, [{ step: 17, operation: 'installed-renderer', status: 'started', elapsedMs }]);
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
