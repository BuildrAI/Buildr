import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQoderCnExecutor } from '../../../build/executors/qoder-cn/index.js';
import type { AgentRuntime, ExecutorEvent } from '../../../src/contracts.ts';

const fixture = await readFile(new URL('./fixtures/qoder-cn-acp.mjs', import.meta.url), 'utf8');

async function program(root: string): Promise<string> {
  const path = join(root, 'qodercn.mjs');
  await writeFile(path, fixture); await chmod(path, 0o755); return path;
}
async function eventually(condition: () => unknown, timeout = 5000) {
  const end = Date.now() + timeout;
  while (!condition()) { if (Date.now() > end) throw new Error('condition timeout'); await new Promise(resolve => setTimeout(resolve, 10)); }
}

test('Qoder CN reports a missing login instead of a generic failure', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-auth-')); let runtime: AgentRuntime | undefined;
  try {
    const configRoot = join(root, 'config'); await mkdir(join(configRoot, 'qoder-cn-config'), { recursive: true }); await writeFile(join(configRoot, 'qoder-cn-config', 'unauthenticated'), '');
    runtime = await createQoderCnExecutor().open({ connectionId: 'qoder-cn', configRoot, executable: await program(root), environment: { PATH: process.env.PATH ?? '' } });
    const account = await runtime.inspectAccount();
    assert.equal(account.status, 'not-authenticated');
    assert.match(account.diagnostic ?? '', /登录 Qoder CN/);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});

test('Qoder CN streams ACP chunks and settles an approval request', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-turn-')); const workspace = join(root, 'workspace'); await mkdir(workspace);
  let runtime: AgentRuntime | undefined;
  try {
    runtime = await createQoderCnExecutor().open({ connectionId: 'qoder-cn', configRoot: join(root, 'config'), executable: await program(root), environment: { PATH: process.env.PATH ?? '' } });
    assert.equal((await runtime.inspectAccount()).status, 'ready');
    const contextRef = await runtime.createContext({ cwd: workspace });
    const events: ExecutorEvent[] = [];
    const sending = runtime.send({ contextRef, cwd: workspace, text: '查看文件', images: [], clientRequestId: '8b7c4c56-8cc0-4f16-a1be-1f2d6f0e4f11', onEvent: event => events.push(event) });
    sending.catch(() => {});
    await eventually(() => events.some(event => event.type === 'request'));
    const request = events.find(event => event.type === 'request');
    assert.equal(request?.type, 'request');
    assert.equal(request.type === 'request' ? request.request.kind : '', 'approval');
    assert.ok(events.some(event => event.type === 'accepted'));
    assert.ok(events.some(event => event.type === 'item' && event.item.role === 'assistant' && event.item.text.includes('收到：查看文件')));
    assert.ok(events.some(event => event.type === 'item' && event.item.kind === 'tool' && event.item.name === '读取文件'));
    await runtime.reply!({ contextRef, executionRef: { id: '8b7c4c56-8cc0-4f16-a1be-1f2d6f0e4f11' }, requestId: request.type === 'request' ? request.request.id : '', answer: { approved: true } });
    await sending;
    const observed = await runtime.observe({ contextRef });
    assert.equal(observed.status, 'idle');
    assert.ok(events.some(event => event.type === 'request-resolved'));
    assert.ok(events.some(event => event.type === 'item' && event.item.kind === 'tool' && event.item.status === 'completed'));
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});

test('Qoder CN stop cancels the native turn instead of claiming success', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-stop-')); const workspace = join(root, 'workspace'); await mkdir(workspace);
  let runtime: AgentRuntime | undefined;
  try {
    runtime = await createQoderCnExecutor().open({ connectionId: 'qoder-cn', configRoot: join(root, 'config'), executable: await program(root), environment: { PATH: process.env.PATH ?? '' } });
    const contextRef = await runtime.createContext({ cwd: workspace });
    const events: ExecutorEvent[] = [];
    const sending = runtime.send({ contextRef, cwd: workspace, text: '等待批准', images: [], clientRequestId: 'e83f0c39-1a83-4d6f-9b45-7d2f6d0c8f21', onEvent: event => events.push(event) });
    sending.catch(() => {});
    await eventually(() => events.some(event => event.type === 'request'));
    const stopped = await runtime.stop({ contextRef, executionRef: { id: 'e83f0c39-1a83-4d6f-9b45-7d2f6d0c8f21' } });
    assert.equal(stopped.status, 'stopped');
    await sending;
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});
