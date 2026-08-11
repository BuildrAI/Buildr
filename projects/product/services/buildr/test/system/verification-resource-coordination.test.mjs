import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseSuccessfulJson, spawnSupervised } from '../helpers/child-process-supervisor.mjs';

const worker = path.resolve('test/fixtures/verification-resource-worker.mjs');
const waitFor = async (predicate, timeoutMs = 10_000) => {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error('timed out waiting for worker state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const waitForJson = async (file, timeoutMs = 10_000) => {
  let value;
  await waitFor(() => {
    try {
      value = JSON.parse(fs.readFileSync(file, 'utf8'));
      return true;
    } catch {
      return false;
    }
  }, timeoutMs);
  return value;
};

function runWorker(root, taskId, acquiredFile, releaseFile, ttlMs = 2_000) {
  return spawnSupervised(process.execPath, [worker, root, taskId, acquiredFile, releaseFile, String(ttlMs)], { owner: { taskId, runId: `run-${taskId}` }, timeoutMs: 15_000 });
}

function ticketCount(root) {
  let count = 0;
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const current = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(current);
      else if (entry.name === 'ticket.json') count += 1;
    }
  };
  visit(root);
  return count;
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
  const secondClaim = await waitForJson(secondAcquired);
  assert.equal(secondClaim.owner.taskId, 'task-b');
  fs.writeFileSync(secondRelease, 'release\n');
  const released = parseSuccessfulJson(await second.completed, 'second resource worker');
  assert.equal(released[0].status, 'released');
});

test('独立进程按已登记 ticket 顺序取得容量', async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-resource-fifo-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'leases');
  const state = (name) => path.join(temporary, name);
  const first = runWorker(root, 'task-a', state('first-acquired'), state('first-release'));
  t.after(() => first.child.kill());
  await waitFor(() => fs.existsSync(state('first-acquired')));
  const second = runWorker(root, 'task-b', state('second-acquired'), state('second-release'));
  t.after(() => second.child.kill());
  await waitFor(() => ticketCount(root) === 1);
  const third = runWorker(root, 'task-c', state('third-acquired'), state('third-release'));
  t.after(() => third.child.kill());
  await waitFor(() => ticketCount(root) === 2);

  fs.writeFileSync(state('first-release'), 'release\n');
  parseSuccessfulJson(await first.completed, 'first FIFO worker');
  await waitFor(() => fs.existsSync(state('second-acquired')));
  assert.equal(fs.existsSync(state('third-acquired')), false);
  fs.writeFileSync(state('second-release'), 'release\n');
  parseSuccessfulJson(await second.completed, 'second FIFO worker');
  await waitFor(() => fs.existsSync(state('third-acquired')));
  fs.writeFileSync(state('third-release'), 'release\n');
  parseSuccessfulJson(await third.completed, 'third FIFO worker');
});

test('崩溃进程的过期 ticket 不永久阻塞队列', async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-resource-stale-ticket-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'leases');
  const state = (name) => path.join(temporary, name);
  const first = runWorker(root, 'task-a', state('first-acquired'), state('first-release'), 100);
  t.after(() => first.child.kill());
  await waitFor(() => fs.existsSync(state('first-acquired')));
  const crashed = runWorker(root, 'task-b', state('crashed-acquired'), state('crashed-release'), 100);
  t.after(() => crashed.child.kill());
  await waitFor(() => ticketCount(root) === 1);
  const crashedCompletion = crashed.completed.catch((error) => error);
  crashed.child.kill();
  await crashedCompletion;
  const later = runWorker(root, 'task-c', state('later-acquired'), state('later-release'), 100);
  t.after(() => later.child.kill());
  await waitFor(() => ticketCount(root) >= 1);
  fs.writeFileSync(state('first-release'), 'release\n');
  parseSuccessfulJson(await first.completed, 'first stale-ticket worker');
  await waitFor(() => fs.existsSync(state('later-acquired')));
  fs.writeFileSync(state('later-release'), 'release\n');
  parseSuccessfulJson(await later.completed, 'later stale-ticket worker');
});
