import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodexExecutor } from '../../build/executors/codex/index.js';
import type { ExecutorEvent, AgentRuntime, ContextRef, ExecutionRef } from '../../src/contracts.ts';

const source = readFileSync(new URL('./fixtures/codex-cli.mjs', import.meta.url), 'utf8');
async function eventually(condition: () => unknown, timeout = 1000) { const until = Date.now() + timeout; while (!condition()) { if (Date.now() > until) throw new Error('condition timeout'); await new Promise(resolve => setTimeout(resolve, 5)); } }
test('Codex native adapter preserves exact context, streams, answers and stops only its native terminal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-executor-codex-')); const workspace = join(root, 'workspace'); await mkdir(workspace);
  const executable = join(root, 'codex.mjs'); await writeFile(executable, source); const configRoot = join(root, 'connection');
  const options = { connectionId: 'codex', configRoot, executable, environment: { PATH: process.env.PATH ?? '', OPENAI_API_KEY: 'must-not-inherit', CODEX_APP_SERVER_TOKEN: 'must-not-inherit' } };
  let runtime: AgentRuntime | undefined; let reference: ContextRef;
  try {
    runtime = await createCodexExecutor().open(options); assert.equal((await runtime.inspectAccount()).status, 'ready'); assert.equal((await runtime.models())[0].id, 'fixture-model');
    reference = await runtime.createContext({ cwd: workspace }); const events: ExecutorEvent[] = [];
    const image = join(root, 'fixture.png'); await writeFile(image, Buffer.from('89504e470d0a1a0a', 'hex'));
    const sending = runtime.send({ contextRef: reference, cwd: workspace, text: '读取图片后执行', images: [{ id: 'image', path: image, mimeType: 'image/png' }], clientRequestId: 'client-1', onEvent: event => events.push(event) });
    await eventually(() => events.find(event => event.type === 'request'));
    const accepted = events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted'); const executionRef = (accepted as { executionRef: ExecutionRef }).executionRef;
    assert.equal(events[0].type, 'accepted'); assert.ok(events.some(event => event.type === 'item' && event.item.text === '你好'));
    const request = events.find(event => event.type === 'request'); assert.equal(request?.type, 'request');
    await assert.rejects(runtime.reply({ contextRef: reference, executionRef: { id: 'wrong' }, requestId: request.request.id, answer: { color: '蓝' } }), /stale/);
    await runtime.reply({ contextRef: reference, executionRef, requestId: request.request.id, answer: { color: '蓝' } });
    await eventually(() => events.some(event => event.type === 'item' && event.item.kind === 'tool'));
    await runtime.stop({ contextRef: reference, executionRef }); await sending;
    await eventually(() => events.some(event => event.type === 'item' && event.item.kind === 'tool' && event.item.status === 'completed'));
    assert.equal((await runtime.observe({ contextRef: reference, executionRef })).status, 'stopped');
    assert.deepEqual(events.find(event=>event.type==='context-usage'),{type:'context-usage',usedTokens:12000,windowTokens:500000});
    const nativeState = JSON.parse(await readFile(join(configRoot, 'codex-home/state.json'), 'utf8')); assert.equal(nativeState[reference.id].turns[0].items[0].content[1].type, 'localImage');
    const binding = runtime.bindingIdentity; await runtime.close(); runtime = await createCodexExecutor().open(options); assert.equal(runtime.bindingIdentity, binding);
    await runtime.resumeContext({ contextRef: reference, cwd: workspace });
    const history = await runtime.readHistory({ contextRef: reference, cwd: workspace }); assert.ok(history.some(item => item.id === 'user-turn-0' && item.executionId === 'turn-0'));
    await assert.rejects(runtime.resumeContext({ contextRef: reference, cwd: root }), /binding_mismatch/);
    const prior={identity:runtime.bindingIdentity,data:runtime.bindingData};await runtime.close();
    await writeFile(executable,source.replace('codex 0.163.0','codex 0.164.0-alpha.11.1'));
    runtime=await createCodexExecutor().open({...options,binding:prior});
    assert.equal(runtime.bindingIdentity,binding);assert.equal(runtime.bindingData?.observedVersion,'0.164.0-alpha.11.1');
    await runtime.resumeContext({contextRef:reference,cwd:workspace});
    assert.ok((await runtime.readHistory({contextRef:reference,cwd:workspace})).some(item=>item.id==='user-turn-0'));
    await runtime.close();runtime=undefined;
    await writeFile(executable,source.replace('codex 0.163.0','codex 1.0.0'));
    await assert.rejects(createCodexExecutor().open({...options,binding:prior}),/version_unsupported/);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});
