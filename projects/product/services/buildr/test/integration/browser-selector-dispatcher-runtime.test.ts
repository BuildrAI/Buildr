import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runAgentConversationCommands, runPhase } from '../verification/browser-selector-dispatcher.ts';
import { createVerificationResourceCoordinator } from '../verification/resource-coordinator.ts';
import { AGENT_CONVERSATION_GROUPS } from '../../../buildr-web/test/browser/agent-conversation-groups.ts';
import { inspectAgentConversationQueue } from '../../../buildr-web/test/browser/agent-conversation-queue.ts';

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

test('conversation batches share the existing browser-runtime capacity with other checks', {timeout: 10_000}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-batch-coordination-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const resources = { 'browser-runtime': { id: 'browser-runtime', strategy: 'coordinated', capacity: 2, authorization: 'implicit' } };
  const other = createVerificationResourceCoordinator({ root, resources, owner: { taskId: 'other', runId: 'other-check' }, pollMs: 10 });
  const conversation = createVerificationResourceCoordinator({ root, resources, owner: { taskId: 'conversation', runId: 'conversation-check' }, pollMs: 10 });
  const externalLease = await other.acquire(['browser-runtime']);
  let externalHeld = true;
  let releaseGroups: () => void = () => {};
  let firstStarted: () => void = () => {};
  let secondStarted: () => void = () => {};
  const gate = new Promise<void>(resolve => { releaseGroups = resolve; });
  const first = new Promise<void>(resolve => { firstStarted = resolve; });
  const second = new Promise<void>(resolve => { secondStarted = resolve; });
  let active = 0, peak = 0;
  const execution = runAgentConversationCommands([{ id: 'one' }, { id: 'two' }, { id: 'three' }], {
    limit: 2,
    acquire: (options: any) => conversation.acquire(['browser-runtime'], options),
    run: async () => {
      active++;
      peak = Math.max(peak, active);
      if (active === 1) firstStarted();
      if (active === 2) secondStarted();
      await gate;
      active--;
      return { status: 'passed' };
    },
  });
  try {
    await first;
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(peak, 1, 'another browser check retains one of the two slots');
    const released = await externalLease.release();
    externalHeld = false;
    assert.ok(released.every((item: any) => item.status === 'released'));
    await second;
    assert.equal(peak, 2);
  } finally {
    if (externalHeld) await externalLease.release();
    releaseGroups();
    const results = await execution;
    assert.deepEqual(results.map(item => item.status), ['passed', 'passed', 'passed']);
  }
});

test('a failed node subtest remains a failure while the next group still executes', () => {
  const script = `
    import test from 'node:test';
    import { runAgentConversationBatch } from '../buildr-web/test/browser/agent-conversation-groups.ts';
    test('batch', async t => {
      await runAgentConversationBatch(['failed-group', 'next-group'], {
        preparePage: async () => {},
        runGroup: async group => {
          await t.test(group, () => {
            if (group === 'failed-group') throw new Error('intentional group failure');
            process.stdout.write('NEXT-GROUP-RAN\\n');
          });
        },
      });
    });
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: path.resolve(import.meta.dirname, '../..'), encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /NEXT-GROUP-RAN/);
  assert.match(result.stdout, /intentional group failure/);
});

test('two long-lived processes dynamically claim each conversation group once', {timeout: 20_000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conversation-queue-processes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = `
    import fs from 'node:fs';
    import path from 'node:path';
    import { claimAgentConversationGroups, finishAgentConversationGroup } from '../buildr-web/test/browser/agent-conversation-queue.ts';
    import { runAgentConversationBatch } from '../buildr-web/test/browser/agent-conversation-groups.ts';
    const root = process.env.TEST_QUEUE;
    fs.writeFileSync(path.join(root, 'ready-' + process.env.WORKER), '');
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(path.join(root, 'ready-1')) || !fs.existsSync(path.join(root, 'ready-2'))) {
      if (Date.now() > deadline) throw new Error('workers did not start');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await runAgentConversationBatch(claimAgentConversationGroups(root), {
      preparePage: async () => {},
      runGroup: async group => { await new Promise(resolve => setTimeout(resolve, group === 'setup' ? 100 : 30)); },
      afterGroup: group => finishAgentConversationGroup(root, group),
    });
  `;
  const commands = [{ id: 'worker-1', worker: '1' }, { id: 'worker-2', worker: '2' }];
  const results = await runAgentConversationCommands(commands, {
    limit: 2,
    acquire: async () => ({ release: async () => [{ status: 'released' }] }),
    run: (command: any) => runPhase(command.id, [process.execPath, '--input-type=module', '-e', script],
      path.resolve(import.meta.dirname, '../..'), 10_000, { ...process.env, TEST_QUEUE: root, WORKER: command.worker }),
  });
  assert.deepEqual(results.map(result => result.status), ['passed', 'passed']);
  assert.deepEqual(inspectAgentConversationQueue(root), { unclaimed: [], unfinished: [], attempted: [...AGENT_CONVERSATION_GROUPS] });
  const owners = new Set(AGENT_CONVERSATION_GROUPS.map(group => fs.readFileSync(path.join(root, group, 'owner'), 'utf8').trim()));
  assert.equal(owners.size, 2);
});

test('a crashed worker is reported and a replacement executes only unclaimed groups', {timeout: 20_000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conversation-queue-crash-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = `
    import { claimAgentConversationGroups, finishAgentConversationGroup } from '../buildr-web/test/browser/agent-conversation-queue.ts';
    import { runAgentConversationBatch } from '../buildr-web/test/browser/agent-conversation-groups.ts';
    await runAgentConversationBatch(claimAgentConversationGroups(process.env.TEST_QUEUE), {
      preparePage: async () => {},
      runGroup: async group => { if (process.env.CRASH === '1' && group === 'setup') process.exit(9); },
      afterGroup: group => finishAgentConversationGroup(process.env.TEST_QUEUE, group),
    });
  `;
  let acquired = 0, released = 0;
  const results = await runAgentConversationCommands([{ id: 'worker' }], {
    limit: 1, maxRestarts: 1, shouldRun: () => inspectAgentConversationQueue(root).unclaimed.length > 0,
    acquire: async () => { acquired++; return { release: async () => { released++; return [{ status: 'released' }]; } }; },
    run: (command: any) => runPhase(command.id, [process.execPath, '--input-type=module', '-e', script],
      path.resolve(import.meta.dirname, '../..'), 10_000,
      { ...process.env, TEST_QUEUE: root, CRASH: command.id.includes(':restart-') ? '0' : '1' }),
  });
  assert.equal(results[0].status, 'failed');
  assert.deepEqual(results[0].attempts.map((attempt: any) => attempt.status), ['failed', 'passed']);
  assert.equal(acquired, 1);
  assert.equal(released, 1);
  const state = inspectAgentConversationQueue(root);
  assert.deepEqual(state.unclaimed, []);
  assert.deepEqual(state.unfinished, ['setup']);
  assert.deepEqual(state.attempted, AGENT_CONVERSATION_GROUPS.slice(1));
});
