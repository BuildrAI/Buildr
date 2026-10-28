import assert from 'node:assert/strict';
import test from 'node:test';
import { terminateOwnedProcess } from '../verification/support/owned-process.ts';

for (const exits of [true, false]) test(`cleanup confirms detached descendants after their group has exited: exits=${exits}`, async t => {
  let now = 1_000, waits = 0;
  let descendantAlive = true;
  t.mock.method(Date, 'now', () => now);
  const result = await terminateOwnedProcess({
    pid: 100, processes: [{ pid: 101 }], platform: 'darwin', confirmMs: 100,
    kill(pid: number, signal: number | string) {
      if (pid !== 101 || !descendantAlive) throw Object.assign(new Error('already exited'), { code: 'ESRCH' });
      assert.ok(signal === 0 || signal === 'SIGKILL');
    },
    async wait(ms: number) {
      now += ms; waits++;
      if (exits && waits === 2) descendantAlive = false;
    },
  });
  assert.equal(result.status, exits ? 'clean' : 'failed');
  assert.deepEqual(result.remaining, exits ? [] : [101]);
  assert.equal(waits, exits ? 2 : 4, 'the same bounded confirmation budget covers the group and all owned descendants');
});
