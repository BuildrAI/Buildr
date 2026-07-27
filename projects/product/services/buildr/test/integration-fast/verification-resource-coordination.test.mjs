import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const worker = path.resolve('test/fixtures/verification-resource-worker.mjs');
const waitFor = async (predicate, timeoutMs = 3_000) => {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error('timed out waiting for worker state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

function runWorker(root, taskId, acquiredFile, releaseFile) {
  const child = spawn(process.execPath, [worker, root, taskId, acquiredFile, releaseFile], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const completed = new Promise((resolve, reject) => child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `worker exited ${code}`))));
  return { child, completed };
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
  await first.completed;
  await waitFor(() => fs.existsSync(secondAcquired));
  const secondClaim = JSON.parse(fs.readFileSync(secondAcquired, 'utf8'));
  assert.equal(secondClaim.owner.taskId, 'task-b');
  fs.writeFileSync(secondRelease, 'release\n');
  const released = JSON.parse(await second.completed);
  assert.equal(released[0].status, 'released');
});
