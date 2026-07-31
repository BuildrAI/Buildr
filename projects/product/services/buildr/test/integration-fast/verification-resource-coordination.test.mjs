import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseSuccessfulJson, spawnSupervised } from '../helpers/child-process-supervisor.mjs';

const worker = path.resolve('test/fixtures/verification-resource-worker.mjs');
const waitFor = async (predicate, timeoutMs = 3_000) => {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error('timed out waiting for worker state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

function runWorker(root, taskId, acquiredFile, releaseFile) {
  return spawnSupervised(process.execPath, [worker, root, taskId, acquiredFile, releaseFile], { owner: { taskId, runId: `run-${taskId}` }, timeoutMs: 5_000 });
}

test('独立进程共享 Workspace 容量槽并按 owner 释放', async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-resource-process-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'leases');
  const firstAcquired = path.join(temporary, 'first-acquired');
  const firstRelease = path.join(temporary, 'first-release');
  const secondAcquired = path.join(temporary, 'second-acquired');
  const secondRelease = path.join(temporary, 'second-release');

  const first = runWorker(root, 'task-a', firstAcquired, firstRelease);
  t.after(() => first.child.kill());
  await waitFor(() => fs.existsSync(firstAcquired));

  const second = runWorker(root, 'task-b', secondAcquired, secondRelease);
  t.after(() => second.child.kill());
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(fs.existsSync(secondAcquired), false);

  fs.writeFileSync(firstRelease, 'release\n');
  parseSuccessfulJson(await first.completed, 'first resource worker');
  await waitFor(() => fs.existsSync(secondAcquired));
  const secondClaim = JSON.parse(fs.readFileSync(secondAcquired, 'utf8'));
  assert.equal(secondClaim.owner.taskId, 'task-b');
  fs.writeFileSync(secondRelease, 'release\n');
  const released = parseSuccessfulJson(await second.completed, 'second resource worker');
  assert.equal(released[0].status, 'released');
});
