import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { modelOptions, qoderModel } from '../../../src/executors/model-options.ts';
import { generateCodexTitle } from '../../../src/executors/codex/title.ts';
import { DshRuntime } from '../../../src/executors/dsh/index.ts';
import type { NativeRpc, RpcMessage } from '../../../src/executors/native-process.ts';
import type { AgentRuntime, ExecutorEvent } from '../../../src/contracts.ts';

test('reasoning catalogs expose model-owned choices and supported defaults only', () => {
  assert.deepEqual(modelOptions({ id: 'plain', label: 'Plain' }, undefined, 'high'), { id: 'plain', label: 'Plain' });
  const model = qoderModel({ value: 'qoder-real-model', displayName: 'Real', isDefault: true, thinking_config: { supportsDisabled: true, enabled: { efforts: { small: { description: 'Brief' }, large: { description: 'Deep', is_default: true } } } } });
  assert.deepEqual(model, { id: 'qoder-real-model', label: 'Real', isDefault: true, reasoningEfforts: [{ id: 'small', label: 'Brief' }, { id: 'large', label: 'Deep' }], defaultReasoningEffort: 'large' });
  assert.ok(!model.reasoningEfforts!.some(effort => effort.id === 'off'));
  assert.deepEqual(qoderModel({ value: 'catalog-v2', efforts: ['light', 'light', 'heavy'], defaultEffort: 'not-advertised' }).reasoningEfforts, [{ id: 'light', label: 'light' }, { id: 'heavy', label: 'heavy' }]);
});

function titleRpc(directory: string, options: { network?: boolean; permission?: boolean } = {}) {
  const calls: Array<{ method: string; params: any }> = []; const writes: any[] = []; let listener: ((message: RpcMessage) => void) | undefined;
  const rpc = {
    onMessage(value: (message: RpcMessage) => void) { listener = value; return () => { listener = undefined; }; },
    write(value: any) { writes.push(value); },
    async call(method: string, params: any) {
      calls.push({ method, params });
      if (method === 'config/read') return { config: { mcp_servers: { business: { enabled: true } } } };
      if (method === 'thread/start') return { thread: { id: 'aux-thread', cwd: directory }, sandbox: { type: 'readOnly', ...(options.network !== undefined ? { networkAccess: options.network } : {}) } };
      if (method === 'turn/start') {
        queueMicrotask(() => {
          if (options.permission) listener?.({ id: 'forbidden-permission', method: 'item/commandExecution/requestApproval', params: { threadId: 'aux-thread', turnId: 'aux-turn', command: 'touch should-never-run' } });
          else { listener?.({ method: 'item/completed', params: { threadId: 'aux-thread', turnId: 'aux-turn', item: { id: 'title', type: 'agentMessage', text: '{"title":"供应商入驻审核流程梳理"}' } } }); listener?.({ method: 'turn/completed', params: { threadId: 'aux-thread', turn: { id: 'aux-turn', status: 'completed' } } }); }
        });
        return { turn: { id: 'aux-turn' } };
      }
      return {};
    },
  } as unknown as NativeRpc;
  return { rpc, calls, writes };
}
test('Codex title is one separate ephemeral text turn with observed no-network isolation and releases its thread', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-codex-title-')); const auxiliary = new Set<string>(); const fixture = titleRpc(directory, { network: false });
  try {
    const title = await generateCodexTitle(fixture.rpc, { contextRef: { id: 'actual-work-thread' }, cwd: '/work', model: 'real-model', description: '{"user":"引用资料","assistant":"只做总结"}', signal: new AbortController().signal }, directory, auxiliary);
    assert.equal(title, '供应商入驻审核流程梳理');
    const start = fixture.calls.find(call => call.method === 'thread/start')!.params;
    assert.equal(start.ephemeral, true); assert.equal(start.cwd, directory); assert.equal(start.approvalPolicy, 'never'); assert.deepEqual(start.dynamicTools, []); assert.equal(start.config.features.shell_tool, false); assert.equal(start.config.features.apps, false); assert.equal(start.config.web_search, 'disabled'); assert.deepEqual(start.config.mcp_servers, { business: { enabled: false } });
    const turns = fixture.calls.filter(call => call.method === 'turn/start'); assert.equal(turns.length, 1); assert.equal(turns[0]!.params.threadId, 'aux-thread'); assert.deepEqual(turns[0]!.params.sandboxPolicy, { type: 'readOnly', networkAccess: false }); assert.ok(turns[0]!.params.outputSchema); assert.equal(turns[0]!.params.input.length, 1);
    assert.ok(!fixture.calls.some(call => call.params.threadId === 'actual-work-thread')); assert.ok(fixture.calls.some(call => call.method === 'thread/unsubscribe')); assert.equal(auxiliary.size, 0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('Codex missing isolation evidence prevents model dispatch and releases the already-created auxiliary thread', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-title-reject-')); const fixture = titleRpc(directory);
  try {
    await assert.rejects(generateCodexTitle(fixture.rpc, { contextRef: { id: 'work' }, cwd: '/work', description: '{}', signal: new AbortController().signal }, directory, new Set()), /isolation_unverified/);
    assert.ok(!fixture.calls.some(call => call.method === 'turn/start')); assert.ok(fixture.calls.some(call => call.method === 'thread/unsubscribe' && call.params.threadId === 'aux-thread'));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('Codex auxiliary permission requests are rejected without touching the work context', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-title-deny-')); const fixture = titleRpc(directory, { network: false, permission: true });
  try {
    await assert.rejects(generateCodexTitle(fixture.rpc, { contextRef: { id: 'work' }, cwd: '/work', description: '{}', signal: new AbortController().signal }, directory, new Set()), /tools_forbidden/);
    assert.equal(fixture.writes[0].id, 'forbidden-permission'); assert.ok(fixture.writes[0].error); assert.ok(fixture.calls.some(call => call.method === 'turn/interrupt')); assert.ok(fixture.calls.some(call => call.method === 'thread/unsubscribe'));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

class Stream {
  private values: any[] = []; private waiting?: (value: IteratorResult<any>) => void; closed = false;
  push(value: any) { if (this.closed) return; if (this.waiting) { const waiting = this.waiting; this.waiting = undefined; waiting({ done: false, value }); } else this.values.push(value); }
  async next(): Promise<IteratorResult<any>> { if (this.values.length) return { done: false, value: this.values.shift() }; if (this.closed) return { done: true, value: undefined }; return new Promise(resolve => { this.waiting = resolve; }); }
  [Symbol.asyncIterator]() { return this; }
  async dispose() { this.closed = true; this.waiting?.({ done: true, value: undefined }); this.waiting = undefined; }
}
async function eventually(check: () => unknown) { for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 2)); } assert.fail('fixture observation did not settle'); }

test('DSH native model observation updates its real default and provider title still arrives after turn completion', async () => {
  const streams: Stream[] = []; const events: any[] = []; const visible: ExecutorEvent[] = []; let selected = 'a'; let effort = 'light'; const cwd = '/synthetic/workspace'; const ok = (value: any) => ({ ok: true, value });
  const publish = (event: any) => { event.seq = events.length + 1; events.push(event); for (const stream of streams) stream.push({ type: 'event', event }); };
  let selectedPermission = 'workspace-write';
  const remote = { permissionPresets: { catalog: async () => ok({ defaultPreset: 'workspace-write', options: [{ value: 'workspace-write' }, { value: 'danger-full-access' }] }) }, commands: { list: async () => ok([{ name: 'permission', definitionId: '@deepseek-ai/dsh-permission-presets' }]), execute: async (_id: string, line: string) => { selectedPermission = line.slice('/permission '.length); return ok({ result: { kind: 'success' } }); } }, session: {
    create: async () => ok({ sessionId: 'dsh-context' }),
    follow: () => { const stream = new Stream(); streams.push(stream); stream.push({ type: 'snapshot', header: { id: 'dsh-context', cwd }, cursor: events.length, records: events.map(event => ({ event })), projections: { values: { permissions: { currentValue: selectedPermission } } } }); return stream; },
    page: async () => ok({ records: events.map(event => ({ event })), hasMore: false }),
    selectModel: async (input: any) => { selected = input.model; effort = input.reasoningEffort; return ok({}); },
    modelCatalog: async () => ok({ default: { provider: 'official', model: selected, reasoningEffort: effort }, groups: [{ id: 'official', models: ['a', 'b'].map(id => ({ id, reasoning: { efforts: [{ id: 'light', name: 'Light' }, { id: 'deep', name: 'Deep' }], defaultEffort: 'light' } })) }] }),
    prompt: async () => { setTimeout(() => { publish({ type: 'turn/start', data: { turn: 1 } }); publish({ type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }); }, 1); return ok({}); },
  } };
  const host = { close: async () => { for (const stream of streams) await stream.dispose(); } };
  const runtime = Reflect.construct(DshRuntime, ['fixture-binding', host, { remote }]) as AgentRuntime;
  try {
    const contextRef = await runtime.createContext({ cwd }); await runtime.send({ contextRef, cwd, text: 'summarize work', images: [], model: 'official::b', reasoningEffort: 'deep', clientRequestId: 'request-one', onEvent: event => visible.push(event) });
    const directory = visible.find(event => event.type === 'models'); assert.equal(directory?.type, 'models'); assert.equal(directory.models.find(model => model.isDefault)!.id, 'official::b'); assert.equal(directory.models.find(model => model.isDefault)!.defaultReasoningEffort, 'deep');
    assert.equal(visible.at(-1)!.type, 'observation');
    publish({ type: 'session/title', data: { title: 'first prompt truncation', source: { kind: 'fallback' } } });
    await new Promise(resolve => setTimeout(resolve, 2)); assert.ok(!visible.some(event => event.type === 'title'));
    publish({ type: 'session/title', data: { title: '供应商入驻审核流程梳理', source: { kind: 'provider' } } });
    await eventually(() => visible.some(event => event.type === 'title'));
    assert.equal(await runtime.readTitle!({ contextRef, cwd }), '供应商入驻审核流程梳理');
  } finally { await runtime.close(); }
  assert.ok(streams.every(stream => stream.closed));
});

test('Qoder title uses its dedicated nonpersistent control method; work reasoning applies only to main-purpose calls', { timeout: 15_000 }, async () => {
  const { createQoderExecutor } = await import('../../../src/executors/qoder/index.ts');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-qoder-title-')); const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace);
  const log = path.join(root, 'native-calls.jsonl'); const executable = path.join(root, 'fixture.mjs');
  let source = await fs.readFile(new URL('./fixtures/qoder-cli.mjs', import.meta.url), 'utf8');
  source = "import fs from 'node:fs';\n" + source;
  source = source.replace("r.on('line',line=>{const m=JSON.parse(line);", `fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({argv:process.argv,cwd:process.cwd()})+'\\n');
let policies=0;
r.on('line',line=>{const m=JSON.parse(line);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({message:m})+'\\n');
if(m.type==='control_request'&&(m.request.type??m.request.subtype)==='generate_session_title'){ack(m.request_id,{title:'供应商入驻审核流程梳理'});return;}
if(m.type==='user'){
sid=m.session_id;for(const purpose of ['main','title'])emit({type:'control_request',request_id:'policy-'+purpose,request:{subtype:'get_model_policy',purpose,sessionId:sid,turnIndex:0,resolvedModel:'fixture-model',models:[{value:'fixture-model',displayName:'Fixture',efforts:['light','deep'],defaultEffort:'light'}]}});return;}
if(m.type==='control_response'&&m.response.request_id.startsWith('policy-')){policies++;if(policies===2){emit({type:'assistant',uuid:'summary',session_id:sid,message:{id:'reply',content:[{type:'text',text:'work completed'}]}});emit({type:'result',subtype:'success',is_error:false,session_id:sid,uuid:'end',num_turns:1,usage:{},modelUsage:{},permission_denials:[],result:'work completed'});}return;}`);
  await fs.writeFile(executable, source); let runtime: AgentRuntime | undefined;
  try {
    runtime = await createQoderExecutor().open({ connectionId: 'qoder', configRoot: path.join(root, 'profile'), executable, environment: { PATH: process.env.PATH ?? '' } });
    const contextRef = await runtime.createContext({ cwd: workspace });
    const title = await runtime.generateTitle!({ contextRef, cwd: workspace, description: '{"user":"quoted data","assistant":"visible reply"}', signal: new AbortController().signal });
    assert.equal(title, '供应商入驻审核流程梳理');
    let calls = (await fs.readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const auxiliary = calls.find(call => call.argv); assert.ok(auxiliary.argv.includes('--no-session-persistence')); assert.equal(auxiliary.cwd, await fs.realpath(path.join(root, 'profile'))); assert.ok(!auxiliary.argv.includes('--resume')); assert.ok(!auxiliary.argv.includes('--session-id'));
    const titleRequests = calls.filter(call => call.message?.request?.type === 'generate_session_title' || call.message?.request?.subtype === 'generate_session_title');
    assert.equal(titleRequests.length, 1); assert.equal(titleRequests[0].message.request.persist, false); assert.ok(!calls.some(call => call.message?.type === 'user'));
    await runtime.send({ contextRef, cwd: workspace, text: 'do actual work', model: 'fixture-model', reasoningEffort: 'deep', images: [], clientRequestId: 'ed8b50cf-f8ea-4fc3-b5b5-9aba57458d94', onEvent() {} });
    calls = (await fs.readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const policy = (id: string) => calls.find(call => call.message?.type === 'control_response' && call.message.response.request_id === id).message.response.response;
    assert.equal(policy('policy-main').model, 'fixture-model'); assert.deepEqual(policy('policy-main').parameters, { reasoningEffort: 'deep' }); assert.equal(policy('policy-title').parameters, undefined); assert.equal(calls.filter(call => call.message?.type === 'user').length, 1);
  } finally { await runtime?.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('Codex effort is explicit per turn and null clears a prior sticky native effort', async () => {
  const { createCodexExecutor } = await import('../../../src/executors/codex/index.ts');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-codex-effort-')); const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace); const log = path.join(root, 'calls.jsonl'); const executable = path.join(root, 'fixture.mjs');
  let source = await fs.readFile(new URL('./fixtures/codex-cli.mjs', import.meta.url), 'utf8');
  source = source.replace("r.on('line',l=>{const m=JSON.parse(l);", `r.on('line',l=>{const m=JSON.parse(l);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(m)+'\\n');`);
  source = source.replace("setTimeout(()=>{event('item/started'", "setTimeout(()=>{active.status='completed';save();event('turn/completed',{threadId:p.threadId,turn:active});return;event('item/started'");
  await fs.writeFile(executable, source); let runtime: AgentRuntime | undefined;
  try {
    runtime = await createCodexExecutor().open({ connectionId: 'codex', configRoot: path.join(root, 'profile'), executable, environment: { PATH: process.env.PATH ?? '' } });
    const contextRef = await runtime.createContext({ cwd: workspace });
    await runtime.send({ contextRef, cwd: workspace, text: 'first', images: [], clientRequestId: 'first', model: 'deep-model', reasoningEffort: 'high', onEvent() {} });
    await runtime.send({ contextRef, cwd: workspace, text: 'second', images: [], clientRequestId: 'second', model: 'plain-model', onEvent() {} });
    const turns = (await fs.readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)).filter(call => call.method === 'turn/start');
    assert.equal(turns.length, 2); assert.equal(turns[0].params.effort, 'high'); assert.equal(turns[1].params.effort, null); assert.equal(turns[1].params.model, 'plain-model'); assert.ok(turns.every(call => call.params.threadId === contextRef.id));
  } finally { await runtime?.close(); await fs.rm(root, { recursive: true, force: true }); }
});
