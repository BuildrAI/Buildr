import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createHash, randomUUID } from 'node:crypto';
import { createQoderCnExecutor } from '../../../build/executors/qoder-cn/index.js';
import type { AgentRuntime, ExecutorEvent } from '../../../src/contracts.ts';

const fixture = await readFile(new URL('./fixtures/qoder-cn-acp.mjs', import.meta.url), 'utf8');
const lease = 'buildr-0123456789abcdef0123456789abcdef';

async function program(root: string): Promise<string> {
  const path = join(root, 'qodercn.mjs');
  await writeFile(path, fixture); await chmod(path, 0o755); return path;
}
async function eventually(condition: () => unknown, timeout = 5000) {
  const end = Date.now() + timeout;
  while (!condition()) { if (Date.now() > end) throw new Error('condition timeout'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
async function signIn(configRoot: string, user = 'fixture-user'): Promise<string> {
  const auth = join(configRoot, 'qoder-cn-config', '.auth'); await mkdir(auth, { recursive: true });
  const machineID = 'fixture-machine-1', key = Buffer.from(machineID.slice(0, 16));
  const cipher = createCipheriv('aes-128-cbc', key, key);
  const payload = Buffer.concat([cipher.update(JSON.stringify({ uid: user, security_oauth_token: 'fixture-token' })), cipher.final()]).toString('base64');
  await writeFile(join(auth, 'machine_id'), machineID); await writeFile(join(auth, 'user'), payload);
  return createHash('sha256').update('qoder-cn:' + user).digest('hex');
}
function gateway(accountIdentity: string) {
  return { identity: 'fixture-gateway', baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'fixture-key', models: [{ id: lease, label: 'Fixture', isDefault: true }], nativeModel: { provider: 'qoder-cn' as const, id: 'dfmodel', accountIdentity } };
}
async function turn(runtime: AgentRuntime, contextRef: Awaited<ReturnType<AgentRuntime['createContext']>>, cwd: string, text: string) {
  const events: ExecutorEvent[] = [];
  await runtime.send({ contextRef, cwd, text, model: lease, images: [], clientRequestId: randomUUID(), onEvent: event => events.push(event) });
  return events;
}
async function records(path: string): Promise<Array<Record<string, unknown>>> {
  return (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
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

test('Qoder CN sends the native model instead of the Buildr lease and keeps one session across messages', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-lease-')); const configRoot = join(root, 'config'), workspace = join(root, 'workspace');
  await mkdir(workspace); const accountIdentity = await signIn(configRoot); await writeFile(join(configRoot, 'qoder-cn-config', 'auto-allow'), ''); const executable = await program(root);
  let runtime: AgentRuntime | undefined;
  try {
    runtime = await createQoderCnExecutor().open({ connectionId: 'qoder-cn', configRoot, executable, environment: { PATH: process.env.PATH ?? '' }, gateway: gateway(accountIdentity) });
    const contextRef = await runtime.createContext({ cwd: workspace });
    const first = await turn(runtime, contextRef, workspace, '第一条');
    assert.ok(first.some(event => event.type === 'accepted'));
    assert.ok(first.some(event => event.type === 'observation' && event.observation.status === 'idle'));
    const selections = await records(join(configRoot, 'qoder-cn-config', 'fixture-config-selections.jsonl'));
    assert.deepEqual(selections.filter(value => value.configId === 'model').map(value => value.value), ['dfmodel']);
    assert.ok(!selections.some(value => String(value.value).startsWith('buildr-')), 'the Buildr route must never reach the native model option');
    await runtime.resumeContext({ contextRef, cwd: workspace });
    const second = await turn(runtime, contextRef, workspace, '第二条');
    assert.ok(second.some(event => event.type === 'observation' && event.observation.status === 'idle'));
    const launches = await records(join(configRoot, 'qoder-cn-config', 'fixture-session-new.jsonl'));
    assert.equal(launches.length, 1, 'two messages must reuse one native session');
    assert.equal(contextRef.id, launches[0]!.sessionId);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});

test('Qoder CN restores its persisted native session after the runtime process restarts', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-restart-')); const configRoot = join(root, 'config'), workspace = join(root, 'workspace');
  await mkdir(workspace); const accountIdentity = await signIn(configRoot); await writeFile(join(configRoot, 'qoder-cn-config', 'auto-allow'), ''); const executable = await program(root);
  const open = () => createQoderCnExecutor().open({ connectionId: 'qoder-cn', configRoot, executable, environment: { PATH: process.env.PATH ?? '' }, gateway: gateway(accountIdentity) });
  let contextRef: Awaited<ReturnType<AgentRuntime['createContext']>>;
  const first = await open();
  try { contextRef = await first.createContext({ cwd: workspace }); await turn(first, contextRef, workspace, '第一轮'); } finally { await first.close(); }
  const second = await open();
  try {
    await second.resumeContext({ contextRef: contextRef!, cwd: workspace });
    const events = await turn(second, contextRef!, workspace, '第二轮');
    assert.ok(events.some(event => event.type === 'observation' && event.observation.status === 'idle'));
    assert.equal((await records(join(configRoot, 'qoder-cn-config', 'fixture-session-new.jsonl'))).length, 1, 'restoring must not create another native session');
    assert.deepEqual((await records(join(configRoot, 'qoder-cn-config', 'fixture-session-load.jsonl'))).map(value => value.sessionId), [contextRef!.id]);
  } finally { await second.close(); await rm(root, { recursive: true, force: true }); }
});

test('Qoder CN reports a missing native session as a recoverable context failure', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-missing-')); const configRoot = join(root, 'config'), workspace = join(root, 'workspace');
  await mkdir(workspace); const accountIdentity = await signIn(configRoot); const executable = await program(root);
  const open = () => createQoderCnExecutor().open({ connectionId: 'qoder-cn', configRoot, executable, environment: { PATH: process.env.PATH ?? '' }, gateway: gateway(accountIdentity) });
  const first = await open(); let contextRef: Awaited<ReturnType<AgentRuntime['createContext']>>;
  try { contextRef = await first.createContext({ cwd: workspace }); } finally { await first.close(); }
  await rm(join(configRoot, 'qoder-cn-config', 'fixture-sessions', contextRef!.id + '.json'));
  const second = await open();
  try {
    await assert.rejects(second.resumeContext({ contextRef: contextRef!, cwd: workspace }), (error: any) => {
      assert.equal(error.code, 'agent_context_unavailable');
      assert.match(error.message, /新的原生会话/);
      return true;
    });
  } finally { await second.close(); await rm(root, { recursive: true, force: true }); }
});
