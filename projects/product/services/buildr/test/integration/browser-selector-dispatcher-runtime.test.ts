import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import { runPhase } from '../verification/browser-selector-dispatcher.ts';

test('Browser dispatcher phase runner is asynchronous and bounded', async () => {
  const passed: any = await runPhase('fixture', [process.execPath, '-e', 'process.stdout.write("fixture-ready")'], process.cwd(), 1_000);
  assert.equal(passed.status, 'passed');
  const timedOut: any = await runPhase('browser', [process.execPath, '-e', 'setInterval(()=>{},1000)'], process.cwd(), 1_000);
  assert.equal(timedOut.status, 'timed-out');
  assert.equal(timedOut.failureCode, 'capability-timeout');
});

test('cancelling a browser phase stops the owned process', async () => {
  const controller = new AbortController();
  const execution = runPhase('cancelled-fixture', [process.execPath, '-e', 'setInterval(()=>{},1000)'], process.cwd(), 10_000, process.env, controller.signal);
  setTimeout(() => controller.abort(), 100);
  const result = await execution;
  assert.equal(result.status, 'cancelled');
  assert.equal(result.failureCode, 'capability-cancelled');
  assert.equal(result.processCleanup.status, 'clean');
});
