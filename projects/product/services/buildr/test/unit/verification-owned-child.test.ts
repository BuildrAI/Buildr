import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { stopOwnedChildProcess } from '../verification/support/owned-process.ts';

test('forced child shutdown waits for actual exit before allowing installation cleanup', async () => {
  const child: any = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null });
  const signals: string[] = [];
  let exited = false;
  child.kill = (signal: string) => {
    signals.push(signal);
    if (signal === 'SIGKILL') setTimeout(() => { exited = true; child.signalCode = signal; child.emit('close'); }, 10);
  };
  await stopOwnedChildProcess(child, 25);
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(exited, true);
  assert.equal(child.listenerCount('close'), 0);
});

test('unconfirmed child exit fails cleanup instead of declaring a clean reusable result', async () => {
  const child: any = Object.assign(new EventEmitter(), { pid: 456, exitCode: null, signalCode: null, kill() {} });
  await assert.rejects(stopOwnedChildProcess(child, 5), /did not close after SIGKILL/u);
  assert.equal(child.listenerCount('close'), 0);
});

test('an already exited child needs no second termination', async () => {
  await stopOwnedChildProcess(null);
  await stopOwnedChildProcess({ exitCode: 0, signalCode: null, kill: () => assert.fail('already exited') });
});
