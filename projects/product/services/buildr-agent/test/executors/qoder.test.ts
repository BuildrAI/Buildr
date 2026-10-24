import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQoderExecutor } from '../../build/executors/qoder/index.js';
import type { ExecutorEvent, AgentRuntime } from '../../src/contracts.ts';

const cli = readFileSync(new URL('./fixtures/qoder-cli.mjs', import.meta.url), 'utf8');
async function eventually(condition: () => unknown, timeout = 3000) { const end = Date.now() + timeout; while (!condition()) { if (Date.now() > end) throw new Error('condition timeout'); await new Promise(resolve => setTimeout(resolve, 10)); } }
test('Qoder SDK worker keeps control responsive and binds native input UUID while send waits', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-executor-qoder-')); const workspace = join(root, 'workspace'); await mkdir(workspace);
  const executable = join(root, 'qoder.mjs'); await writeFile(executable, cli); let runtime: AgentRuntime | undefined;
  try {
    runtime = await createQoderExecutor().open({ connectionId: 'qoder', configRoot: join(root, 'config'), executable, environment: { PATH: process.env.PATH ?? '', QODER_PERSONAL_ACCESS_TOKEN: 'must-not-inherit' } });
    assert.equal((await runtime.inspectAccount()).status, 'ready');
    const contextRef = await runtime.createContext({ cwd: workspace }); const events: ExecutorEvent[] = [];
    let failure: unknown; const sending = runtime.send({ contextRef, cwd: workspace, text: '继续处理', images: [], clientRequestId: '4d2b231e-3ddd-4e85-8b5c-6a18a623ac8d', onEvent: event => events.push(event) }); sending.catch(error => { failure = error; });
    await eventually(() => { if (failure) throw failure; return events.some(event => event.type === 'request'); });
    const accepted = events.find(event => event.type === 'accepted'); const request = events.find(event => event.type === 'request'); assert.equal(accepted?.type, 'accepted'); assert.equal(request?.type, 'request');
    assert.equal(accepted.inputItemId, '4d2b231e-3ddd-4e85-8b5c-6a18a623ac8d');
    await runtime.reply({ contextRef, executionRef: accepted.executionRef, requestId: request.request.id, answer: { '0': '蓝' } });
    await eventually(() => events.some(event => event.type === 'item' && event.item.text.includes('已收到蓝色')));
    await runtime.stop({ contextRef, executionRef: accepted.executionRef }); await sending;
    assert.equal((await runtime.observe({ contextRef, executionRef: accepted.executionRef })).status, 'stopped');
    const assistantIds = events.filter(event => event.type === 'item' && event.item.role === 'assistant').map(event => event.type === 'item' ? event.item.id : '');
    assert.equal(new Set(assistantIds).size, 1);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});

test('Qoder close releases an active SDK query while a question is unanswered', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-executor-qoder-close-')); const workspace = join(root, 'workspace'); await mkdir(workspace);
  const executable = join(root, 'qoder.mjs'); await writeFile(executable, cli); let runtime: AgentRuntime | undefined;
  try {
    runtime = await createQoderExecutor().open({ connectionId: 'qoder', configRoot: join(root, 'config'), executable, environment: { PATH: process.env.PATH ?? '' } });
    const contextRef = await runtime.createContext({ cwd: workspace }); const events: ExecutorEvent[] = [];
    const sending = runtime.send({ contextRef, cwd: workspace, text: '等待用户', images: [], clientRequestId: 'c2d58b2e-a31a-4330-a7f9-1641fbb29d9f', onEvent: event => events.push(event) }); sending.catch(() => {});
    await eventually(() => events.some(event => event.type === 'request'));
    const start = Date.now(); await runtime.close(); runtime = undefined;
    await assert.rejects(sending, /qoder_|agent_/); assert.ok(Date.now() - start < 6000);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});
