import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { processAlive, startManagedProcess, terminateVerifiedProcess } from '../../src/modules/service-runtime/infrastructure/managed-process.ts';

test('终止闭包每次重核已保存身份，变化时不向进程组发送信号', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'service-runtime-process-'));
  const child = await startManagedProcess({ command: [process.execPath, '-e', 'setInterval(()=>{},1000)'], cwd: directory, logPath: path.join(directory, 'process.log') });
  assert.ok(child.identity);
  const original = child.identity!.startTime;
  t.after(async () => { child.identity!.startTime = original; await child.kill(); fs.rmSync(directory, { recursive: true, force: true }); });
  child.identity!.startTime = 'different-process-start';
  await assert.rejects(child.kill(), /身份/);
  assert.equal(processAlive(child.pid), true);
  await assert.rejects(terminateVerifiedProcess({ pid: -1, groupId: -1, startTime: original }), /身份/);
  child.identity!.startTime = original;
  await child.kill();
  await child.exited;
  assert.equal(processAlive(child.pid), false);
});
