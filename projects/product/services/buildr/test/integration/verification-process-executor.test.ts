import assert from 'node:assert/strict';
import test from 'node:test';
import process from 'node:process';
import { executeVerificationCommand } from '../../src/verification/infrastructure/process-executor.ts';

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
