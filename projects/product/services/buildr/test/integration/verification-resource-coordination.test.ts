import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseSuccessfulJson, spawnSupervised } from '../helpers/child-process-supervisor.ts';

const worker: any = path.resolve('test/fixtures/verification-resource-worker.ts');
const waitFor: any = async (predicate: any, timeoutMs: any = 10_000) => {
  const startedAt: any = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error('timed out waiting for worker state');
    await new Promise((resolve: any) => setTimeout(resolve, 10));
  }
};

const waitForJson: any = async (file: any, timeoutMs: any = 10_000) => {
  let value: any;
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

function runWorker(root: any, taskId: any, acquiredFile: any, releaseFile: any, ttlMs: any = 2_000): any  {
  return spawnSupervised(process.execPath, [worker, root, taskId, acquiredFile, releaseFile, String(ttlMs)], { owner: { taskId, runId: `run-${taskId}` }, timeoutMs: 15_000 });
}

function ticketCount(root: any): any  {
  let count: any = 0;
  const visit: any = (directory: any) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const current: any = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(current);
      else if (entry.name === 'ticket.json') count += 1;
    }
  };
  visit(root);
  return count;
}

function expireTickets(root: any): any  {
  const visit: any = (directory: any) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const current: any = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(current);
      else if (entry.name === 'ticket.json') {
        const ticket: any = JSON.parse(fs.readFileSync(current, 'utf8'));
        fs.writeFileSync(current, `${JSON.stringify({ ...ticket, expiresAt: new Date(0).toISOString() }, null, 2)}\n`);
      }
    }
  };
  visit(root);
}

test('独立进程共享 Workspace 容量槽并按 owner 释放', async (t: any) => {
  const temporary: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-resource-process-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root: any = path.join(temporary, 'leases');
  const firstAcquired: any = path.join(temporary, 'first-acquired');
  const firstRelease: any = path.join(temporary, 'first-release');
  const secondAcquired: any = path.join(temporary, 'second-acquired');
  const secondRelease: any = path.join(temporary, 'second-release');

  const first: any = runWorker(root, 'task-a', firstAcquired, firstRelease);
  t.after(() => first.child.kill());
  await waitFor(() => fs.existsSync(firstAcquired));

  const second: any = runWorker(root, 'task-b', secondAcquired, secondRelease);
  t.after(() => second.child.kill());
  await new Promise((resolve: any) => setTimeout(resolve, 150));
  assert.equal(fs.existsSync(secondAcquired), false);

  fs.writeFileSync(firstRelease, 'release\n');
  parseSuccessfulJson(await first.completed, 'first resource worker');
  const secondClaim: any = await waitForJson(secondAcquired);
  assert.equal(secondClaim.owner.taskId, 'task-b');
  fs.writeFileSync(secondRelease, 'release\n');
  const released: any = parseSuccessfulJson(await second.completed, 'second resource worker');
  assert.equal(released[0].status, 'released');
});

test('独立进程按已登记 ticket 顺序取得容量', async (t: any) => {
  const temporary: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-resource-fifo-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root: any = path.join(temporary, 'leases');
  const state: any = (name: any) => path.join(temporary, name);
  const first: any = runWorker(root, 'task-a', state('first-acquired'), state('first-release'));
  t.after(() => first.child.kill());
  await waitFor(() => fs.existsSync(state('first-acquired')));
  const second: any = runWorker(root, 'task-b', state('second-acquired'), state('second-release'));
  t.after(() => second.child.kill());
  await waitFor(() => ticketCount(root) === 1);
  const third: any = runWorker(root, 'task-c', state('third-acquired'), state('third-release'));
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

test('崩溃进程的已过期 ticket 不永久阻塞队列', async (t: any) => {
  const temporary: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-resource-stale-ticket-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root: any = path.join(temporary, 'leases');
  const state: any = (name: any) => path.join(temporary, name);
  const first: any = runWorker(root, 'task-a', state('first-acquired'), state('first-release'));
  t.after(() => first.child.kill());
  await waitFor(() => fs.existsSync(state('first-acquired')));
  const crashed: any = runWorker(root, 'task-b', state('crashed-acquired'), state('crashed-release'));
  t.after(() => crashed.child.kill());
  await waitFor(() => ticketCount(root) === 1);
  const crashedCompletion: any = crashed.completed.catch((error: any) => error);
  crashed.child.kill();
  await crashedCompletion;
  expireTickets(root);
  const later: any = runWorker(root, 'task-c', state('later-acquired'), state('later-release'));
  t.after(() => later.child.kill());
  await waitFor(() => ticketCount(root) >= 1);
  fs.writeFileSync(state('first-release'), 'release\n');
  parseSuccessfulJson(await first.completed, 'first stale-ticket worker');
  await waitFor(() => fs.existsSync(state('later-acquired')));
  fs.writeFileSync(state('later-release'), 'release\n');
  parseSuccessfulJson(await later.completed, 'later stale-ticket worker');
});
