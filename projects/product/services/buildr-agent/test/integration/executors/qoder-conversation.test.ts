import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createQoderExecutor } from '../../../src/executors/qoder/index.ts';
import type { ExecutorEvent, PermissionMode } from '../../../src/contracts.ts';

async function fixture(externalModel = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'buildr-qoder-conversation-'))), cwd = join(root, 'workspace'), configRoot = join(root, 'config');
  await mkdir(cwd); const executable = join(root, 'qoder.mjs'); await writeFile(executable, await readFile(new URL('./fixtures/qoder-conversation-cli.mjs', import.meta.url)));
  const runtime = await createQoderExecutor().open({ connectionId: 'qoder', configRoot, executable, environment: { PATH: process.env.PATH ?? '' }, ...(externalModel ? { gateway: { identity: 'fixture-source', baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'fixture-key', models: [{ id: 'fixture-model', label: 'Fixture' }] } } : {}) });
  const contextRef = await runtime.createContext({ cwd });
  const send = async (text: string, permissionMode: PermissionMode = 'default') => {
    const events: ExecutorEvent[] = [], clientRequestId = randomUUID();
    await runtime.send({ contextRef, cwd, text, permissionMode, images: [], clientRequestId, onEvent: event => events.push(event) }); return { events, clientRequestId };
  };
  return { root, cwd, configRoot, runtime, contextRef, send,
    async launches() { return (await readFile(join(configRoot, 'qoder-config/conversation-launches.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line)); },
    async close() { await runtime.close(); await rm(root, { recursive: true, force: true }); } };
}
async function eventually(check: () => unknown) { for (let i = 0; i < 400; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('native conversation did not settle'); }

for (const input of ['background-continue-error', 'background-continue-error-array']) test('Qoder foreground error retains native background continuation and converges after its final result: ' + input, async () => {
  const f = await fixture();
  try {
    const round = await f.send(input);
    const accepted = round.events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted');
    const control = { contextRef: f.contextRef, executionRef: accepted.executionRef };
    assert.equal(await f.runtime.canRelease!(control), false, 'a backgrounded tool receipt is not completion');
    await writeFile(join(f.configRoot, 'qoder-config/continue-background'), 'yes');
    await eventually(() => round.events.some(event => event.type === 'item' && event.item.id === 'continuation-tool'));
    assert.equal((await f.runtime.observe(control)).status, 'running');
    assert.equal(await f.runtime.canRelease!(control), false);
    await assert.rejects(f.send('must not enter'), /agent_native_turn_active/);
    await writeFile(join(f.configRoot, 'qoder-config/complete-continuation'), 'yes');
    await eventually(() => round.events.some(event => event.type === 'item' && event.item.text === 'continued final answer'));
    assert.equal((await f.runtime.observe(control)).status, 'idle');
    const history = await f.runtime.readHistory({ contextRef: f.contextRef, cwd: f.cwd });
    assert.deepEqual(history.filter(item => item.role === 'user').map(item => item.id), [round.clientRequestId]);
    assert.ok(history.filter(item => item.text === 'continued final answer' || item.id === 'continuation-tool').every(item => item.executionId === round.clientRequestId));
    assert.deepEqual(await f.runtime.canRelease!(control), { executionState: 'ended' });
    assert.equal(round.events.filter(event => event.type === 'accepted').length, 1);
    assert.equal((await f.launches()).length, 1);
  } finally { await f.close(); }
});

test('Qoder ordinary task metadata with a taskId is not a live background process', async () => {
  const f = await fixture();
  try {
    const round = await f.send('task-metadata');
    const accepted = round.events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted');
    const control = { contextRef: f.contextRef, executionRef: accepted.executionRef };
    assert.equal((await f.runtime.observe(control)).status, 'idle');
    assert.deepEqual(await f.runtime.canRelease!(control), { executionState: 'ended' });
  } finally { await f.close(); }
});

for (const mode of ['foreign-task', 'foreign-tool', 'human']) test('Qoder cannot use an unowned notification or copied text to settle the original turn: ' + mode, async () => {
  const f = await fixture();
  try {
    const round = await f.send('background-continue-error');
    const accepted = round.events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted');
    const control = { contextRef: f.contextRef, executionRef: accepted.executionRef };
    await writeFile(join(f.configRoot, 'qoder-config/continue-background'), mode);
    await eventually(() => round.events.some(event => event.type === 'observation' && event.observation.status === 'unknown'));
    await writeFile(join(f.configRoot, 'qoder-config/complete-continuation'), 'yes');
    // Wait for the fixture to emit its final result, then independently reread the original execution.
    await eventually(() => existsSync(join(f.configRoot, 'qoder-config/complete-continuation')) === false);
    assert.equal((await f.runtime.observe(control)).status, 'unknown');
    assert.equal(await f.runtime.canRelease!(control), false);
    await assert.rejects(f.send('must not enter'), /agent_native_turn_active/);
    assert.equal(round.events.filter(event => event.type === 'accepted').length, 1);
  } finally { await f.close(); }
});

test('Qoder reuses two proven normal rounds, preserves native history and releases its exact idle child', async () => {
  const f = await fixture();
  try {
    const one = await f.send('one');
    await f.runtime.resumeContext({ contextRef: f.contextRef, cwd: f.cwd });
    const history = await f.runtime.readHistory({ contextRef: f.contextRef, cwd: f.cwd });
    assert.equal(history.find(item => item.role === 'user')?.id, one.clientRequestId);
    const two = await f.send('two');
    assert.equal((await f.launches()).length, 1, 'two settled rounds should share one native CLI');
    for (const round of [one, two]) {
      assert.equal(round.events.filter(event => event.type === 'accepted').length, 1);
      assert.ok(round.events.some(event => event.type === 'completed' && event.status === 'completed'));
      assert.ok(round.events.filter(event => event.type === 'item').every(event => event.type !== 'item' || event.item.executionId === round.clientRequestId));
    }
    const accepted = two.events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted');
    assert.deepEqual(await f.runtime.canRelease!({ contextRef: f.contextRef, executionRef: accepted.executionRef }), { executionState: 'ended' });
  } finally { await f.close(); }
});

test('Qoder permission changes and external history invalidate idle reuse without changing the native context', async () => {
  const f = await fixture();
  try {
    await f.send('one', 'full-access'); await f.send('two', 'default');
    assert.equal((await f.launches()).length, 2);
    const root = join(f.configRoot, 'qoder-config/projects'), directory = join(root, (await readdir(root))[0]), filename = join(directory, f.contextRef.id + '.jsonl');
    const records = (await readFile(filename, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    records[0].message.content[0].text = 'changed by another entry'; await writeFile(filename, records.map(record => JSON.stringify(record)).join('\n') + '\n');
    await f.runtime.readHistory({ contextRef: f.contextRef, cwd: f.cwd }); await f.send('three');
    assert.equal((await f.launches()).length, 3);
    assert.ok((await f.launches()).every(launch => launch.args.includes(f.contextRef.id)));
  } finally { await f.close(); }
});

test('Qoder interleaved child streaming retains stable parent identity without corrupting the main stream', async () => {
  const f = await fixture();
  try {
    const { events } = await f.send('stream-children');
    const items = events.flatMap(event => event.type === 'item' && event.item.role === 'assistant' ? [event.item] : []);
    assert.ok(items.some(item => item.parentToolId === 'delegate-tool' && item.text === 'child report complete' && item.status === 'completed'));
    assert.ok(items.some(item => !item.parentToolId && item.text === 'main before main after' && item.status === 'running'));
    assert.ok(items.filter(item => !item.parentToolId).every(item => !item.text.includes('child')));
  } finally { await f.close(); }
});

test('Qoder child completion before the exact input echo cannot accept or end its main round', async () => {
  const f = await fixture();
  try {
    const events: ExecutorEvent[] = [];
    await f.runtime.send({ contextRef: f.contextRef, cwd: f.cwd, text: 'child-before-receipt', images: [], clientRequestId: randomUUID(), onEvent: event => {
      if (event.type === 'item' && event.item.parentToolId) assert.ok(!events.some(previous => previous.type === 'accepted' || previous.type === 'completed'));
      events.push(event);
    } });
    assert.equal(events.filter(event => event.type === 'accepted').length, 1);
    assert.equal(events.filter(event => event.type === 'completed').length, 1);
    assert.ok(events.some(event => event.type === 'item' && event.item.parentToolId === 'delegate-tool' && event.item.status === 'completed'));
  } finally { await f.close(); }
});

test('Qoder post-result native tool output reaches the original handler and protects release until completed', async () => {
  const f = await fixture();
  try {
    const round = await f.send('background');
    const accepted = round.events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted');
    const control = { contextRef: f.contextRef, executionRef: accepted.executionRef };
    assert.equal((await f.runtime.observe(control)).status, 'tools-active');
    assert.equal(await f.runtime.canRelease!(control), false);
    await eventually(() => round.events.some(event => event.type === 'item' && event.item.id === 'background-tool' && event.item.text === 'background complete'));
    assert.ok(round.events.some(event => event.type === 'item' && event.item.parentToolId === 'background-tool' && event.item.text === 'late child report'));
    assert.equal((await f.runtime.observe(control)).status, 'idle');
    assert.deepEqual(await f.runtime.canRelease!(control), { executionState: 'ended' });
  } finally { await f.close(); }
});

test('Qoder missing mirror proof cold-restores, while unsettled native tools refuse a new input', async () => {
  const f = await fixture();
  try {
    await f.send('no-mirror'); await f.send('next');
    assert.equal((await f.launches()).length, 2);
    const round = await f.send('unsettled-tool');
    const accepted = round.events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted');
    assert.equal(await f.runtime.canRelease!({ contextRef: f.contextRef, executionRef: accepted.executionRef }), false);
    await assert.rejects(f.send('must not enter native queue'), /agent_native_turn_active/);
    assert.equal((await f.launches()).length, 2);
  } finally { await f.close(); }
});

test('Qoder exact release covers a slow idle native close without a false RPC timeout', { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const round = await f.send('close-slow');
    const accepted = round.events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted');
    const started = Date.now();
    assert.deepEqual(await f.runtime.canRelease!({ contextRef: f.contextRef, executionRef: accepted.executionRef }), { executionState: 'ended' });
    assert.ok(Date.now() - started >= 2000, 'fixture must exercise the bounded close rather than an immediate child exit');
  } finally { await f.close(); }
});

test('Qoder child question after the main result keeps its exact parent and can still receive a real answer', { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const round = await f.send('child-question', 'full-access');
    await eventually(() => round.events.some(event => event.type === 'request'));
    const request = round.events.find(event => event.type === 'request'), accepted = round.events.find(event => event.type === 'accepted');
    assert.equal(request?.type, 'request'); assert.equal(accepted?.type, 'accepted');
    assert.equal(request.request.kind, 'question'); assert.equal(request.request.parentToolId, 'background-tool');
    const control = { contextRef: f.contextRef, executionRef: accepted.executionRef };
    const waiting = await f.runtime.observe(control);
    assert.equal(waiting.status, 'waiting'); assert.equal(waiting.requests?.[0].id, request.request.id); assert.equal(waiting.requests?.[0].parentToolId, 'background-tool');
    assert.equal(await f.runtime.canRelease!(control), false);
    await f.runtime.reply({ ...control, requestId: request.request.id, answer: { '0': 'yes' } });
    await eventually(() => round.events.some(event => event.type === 'item' && event.item.text === 'child answered yes' && event.item.parentToolId === 'background-tool'));
    await eventually(() => round.events.some(event => event.type === 'item' && event.item.id === 'background-tool' && event.item.status === 'completed'));
    assert.deepEqual(await f.runtime.canRelease!(control), { executionState: 'ended' });
  } finally { await f.close(); }
});

test('Qoder full-access allows only advertised ordinary tools and still asks business questions and unknown permissions', { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const known = await f.send('permission-known', 'full-access');
    assert.ok(!known.events.some(event => event.type === 'request'));
    for (const [text, kind] of [['permission-unknown', 'approval'], ['permission-special', 'approval'], ['question', 'question']] as const) {
      const events: ExecutorEvent[] = [], clientRequestId = randomUUID();
      const sending = f.runtime.send({ contextRef: f.contextRef, cwd: f.cwd, text, images: [], permissionMode: 'full-access', clientRequestId, onEvent: event => events.push(event) }); sending.catch(() => {});
      await eventually(() => events.some(event => event.type === 'request'));
      assert.equal(events.find(event => event.type === 'request')?.request.kind, kind);
      const accepted = events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted');
      await f.runtime.stop({ contextRef: f.contextRef, executionRef: accepted.executionRef }); await sending;
    }
  } finally { await f.close(); }
});


test('Qoder late child permission during warm account check preserves the old execution and rejects new work without closing it', { timeout: 10000 }, async () => {
  const f = await fixture(true);
  try {
    const first = await f.send('settled-child-parent');
    const accepted = first.events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted');
    const config = join(f.configRoot, 'qoder-config'), gate = join(config, 'hold-account');
    await writeFile(gate, 'hold');
    const attempted: ExecutorEvent[] = [], nextId = randomUUID();
    const blocked = f.runtime.send({ contextRef: f.contextRef, cwd: f.cwd, text: 'new work must not enter', images: [], clientRequestId: nextId, onEvent: event => attempted.push(event) }); blocked.catch(() => {});
    await eventually(() => existsSync(join(config, 'account-held')));
    await writeFile(join(config, 'inject-child-question'), 'question');
    await eventually(() => first.events.some(event => event.type === 'request'));
    const request = first.events.find(event => event.type === 'request'); assert.equal(request?.type, 'request');
    await assert.rejects(f.send('pending work must not enter'), /agent_native_turn_active/);
    await rm(gate); await assert.rejects(blocked, /agent_native_turn_active/);
    assert.ok(!attempted.some(event => event.type === 'accepted' || event.type === 'request'));
    const native = (await readFile(join(config, 'native-inputs.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(native.map(item => item.uuid), [first.clientRequestId]);
    const control = { contextRef: f.contextRef, executionRef: accepted.executionRef };
    const observed = await f.runtime.observe(control); assert.equal(observed.status, 'waiting'); assert.equal(observed.requests?.[0].id, request.request.id);
    await f.runtime.reply({ ...control, requestId: request.request.id, answer: { '0': 'yes' } });
    await eventually(() => first.events.some(event => event.type === 'item' && event.item.text === 'child answered yes'));
    assert.equal((await f.launches()).length, 1);
  } finally { await f.close(); }
});

test('Qoder observes exact task_started arriving after the parent result and holds release until its notification', async () => {
  const f = await fixture();
  try {
    const round = await f.send('late-task-start');
    const accepted = round.events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted');
    const mainEnd = round.events.findIndex(event => event.type === 'completed');
    await eventually(() => round.events.slice(mainEnd + 1).some(event => event.type === 'observation' && event.observation.backgroundWork));
    const control = { contextRef: f.contextRef, executionRef: accepted.executionRef };
    assert.equal(await f.runtime.canRelease!(control), false);
    await writeFile(join(f.configRoot, 'qoder-config/settle-background'), 'settled');
    await eventually(() => round.events.some(event => event.type === 'observation' && event.observation.backgroundWork === false && event.observation.tools.every(tool => tool.status === 'completed')));
    await eventually(() => round.events.some(event => event.type === 'item' && event.item.id === 'background-tool' && event.item.text.includes('actual background report')));
    const report = round.events.findLast(event => event.type === 'item' && event.item.id === 'background-tool');
    assert.equal(report?.type, 'item'); assert.match(report.item.text, /background launched/); assert.match(report.item.text, /native-report\.md/);
    assert.deepEqual(await f.runtime.canRelease!(control), { executionState: 'ended' });
  } finally { await f.close(); }
});

test('Qoder stopped parent can release after the exact late background completion without an idle CLI leak', async () => {
  const f = await fixture();
  try {
    const events: ExecutorEvent[] = [];
    const sending = f.runtime.send({ contextRef: f.contextRef, cwd: f.cwd, text: 'background-stop-wait', images: [], clientRequestId: randomUUID(), onEvent: event => events.push(event) }); sending.catch(() => {});
    await eventually(() => events.some(event => event.type === 'observation' && event.observation.backgroundWork));
    const accepted = events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted');
    const control = { contextRef: f.contextRef, executionRef: accepted.executionRef };
    await f.runtime.stop(control); await sending;
    assert.ok(events.some(event => event.type === 'completed' && event.status === 'stopped'));
    assert.equal(await f.runtime.canRelease!(control), false);
    await writeFile(join(f.configRoot, 'qoder-config/settle-background'), 'settled');
    await eventually(() => events.some(event => event.type === 'observation' && event.observation.status === 'stopped'));
    assert.deepEqual(await f.runtime.canRelease!(control), { executionState: 'ended' });
  } finally { await f.close(); }
});


test('Qoder unmatched late task on a reused query remains unknown instead of becoming successful new-round work', async () => {
  const f = await fixture();
  try {
    await f.send('one');
    const round = await f.send('late-unowned-task');
    const accepted = round.events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted');
    const control = { contextRef: f.contextRef, executionRef: accepted.executionRef };
    assert.equal((await f.runtime.observe(control)).status, 'unknown');
    assert.equal(await f.runtime.canRelease!(control), false);
    assert.ok(!round.events.some(event => event.type === 'item' && event.item.id === 'retired-tool'));
    await writeFile(join(f.configRoot, 'qoder-config/settle-background'), 'settled');
    await eventually(() => round.events.some(event => event.type === 'observation' && event.observation.status === 'idle'));
    assert.deepEqual(await f.runtime.canRelease!(control), { executionState: 'ended' });
  } finally { await f.close(); }
});


test('Qoder prepares a real connection with zero inputs and adopts it without duplicate account/model queries',async()=>{
  const f=await fixture(true);
  try {
    await f.runtime.prepareContext!({contextRef:f.contextRef,cwd:f.cwd,model:'fixture-model',permissionMode:'default'});
    assert.equal((await f.launches()).length,1);
    assert.equal(existsSync(join(f.configRoot,'qoder-config/native-inputs.jsonl')),false);
    let methods=(await readFile(join(f.configRoot,'qoder-config/control-methods.jsonl'),'utf8')).trim().split('\n').map(x=>JSON.parse(x));
    assert.equal(methods.filter(x=>x==='initialize').length,1);
    assert.equal(methods.filter(x=>x==='account_info'||x==='get_models').length,0,'initialization already supplies both observations');
    const round=await f.send('first real input');
    assert.equal((await f.launches()).length,1);
    assert.equal(round.events.filter(event=>event.type==='accepted').length,1);
    methods=(await readFile(join(f.configRoot,'qoder-config/control-methods.jsonl'),'utf8')).trim().split('\n').map(x=>JSON.parse(x));
    assert.equal(methods.filter(x=>x==='get_models').length,0);
    await f.send('second real input');
    methods=(await readFile(join(f.configRoot,'qoder-config/control-methods.jsonl'),'utf8')).trim().split('\n').map(x=>JSON.parse(x));
    assert.equal(methods.filter(x=>x==='get_models').length,1,'later rounds still inspect current model availability');
  } finally {await f.close();}
});


test('Qoder initialization refuses invalid account/model observations before any work input',async()=>{
 for(const [marker,diagnostic] of [['missing-account','qoder_platform_login_required'],['missing-model','qoder_gateway_model_unavailable']]){
  const f=await fixture(true);try{
   await writeFile(join(f.configRoot,'qoder-config',marker),'invalid');
   await assert.rejects(f.runtime.prepareContext!({contextRef:f.contextRef,cwd:f.cwd,model:'fixture-model'}),new RegExp(diagnostic));
   assert.equal(existsSync(join(f.configRoot,'qoder-config/native-inputs.jsonl')),false);
  }finally{await f.close();}
 }
});
