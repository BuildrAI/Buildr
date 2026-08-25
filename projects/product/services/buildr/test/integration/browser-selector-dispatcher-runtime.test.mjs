import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import { runPhase } from '../../test/verification/browser-selector-dispatcher.mjs';

test('Browser dispatcher phase runner is asynchronous and bounded', async () => {
  const passed = await runPhase('fixture', [process.execPath, '-e', 'process.stdout.write("fixture-ready")'], process.cwd(), 1_000);
  assert.equal(passed.status, 'passed');
  const timedOut = await runPhase('browser', [process.execPath, '-e', 'setInterval(()=>{},1000)'], process.cwd(), 1_000);
  assert.equal(timedOut.status, 'timed-out');
  assert.equal(timedOut.failureCode, 'capability-timeout');
});
