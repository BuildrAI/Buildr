import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { modelOptions, qoderModel } from '../../../src/executors/model-options.ts';
import { translateRequest } from '../../../src/model-access/protocols.ts';
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

function titleRpc(directory: string, options: { network?: boolean; permission?: boolean; handoff?:boolean; delay?:number; output?:string } = {}) {
  const calls: Array<{ method: string; params: any }> = []; const writes: any[] = []; let listener: ((message: RpcMessage) => void) | undefined;
  const rpc = {
    onMessage(value: (message: RpcMessage) => void) { listener = value; return () => { listener = undefined; }; },
    write(value: any) { writes.push(value); },
    async call(method: string, params: any) {
      calls.push({ method, params });
      if (method === 'config/read') return { config: { mcp_servers: { business: { enabled: true } } } };
      if (method === 'thread/start') return { thread: { id: 'aux-thread', cwd: directory }, sandbox: { type: 'readOnly', ...(options.network !== undefined ? { networkAccess: options.network } : {}) } };
      if (method === 'turn/start') {
        const emit = () => {
          if (options.permission) listener?.({ id: 'forbidden-permission', method: 'item/commandExecution/requestApproval', params: { threadId: 'aux-thread', turnId: 'aux-turn', command: 'touch should-never-run' } });
          else { listener?.({ method: 'item/completed', params: { threadId: 'aux-thread', turnId: 'aux-turn', item: { id: 'title', type: 'agentMessage', text: options.output ?? (options.handoff?'{"summary":"已检查目录，真实启动待验证。"}':'{"title":"供应商入驻审核流程梳理"}') } } }); listener?.({ method: 'turn/completed', params: { threadId: 'aux-thread', turn: { id: 'aux-turn', status: 'completed' } } }); }
        };
        if(options.delay)setTimeout(emit,options.delay);else queueMicrotask(emit);
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
    assert.equal(start.config.features.default_mode_request_user_input, false); assert.equal(start.developerInstructions, undefined);
    const turns = fixture.calls.filter(call => call.method === 'turn/start'); assert.equal(turns.length, 1); assert.equal(turns[0]!.params.threadId, 'aux-thread'); assert.deepEqual(turns[0]!.params.sandboxPolicy, { type: 'readOnly', networkAccess: false }); assert.ok(turns[0]!.params.outputSchema); assert.match(start.baseInstructions, /JSON.*title/); assert.match(turns[0]!.params.input[0].text, /\{"title":"精短标题"\}/); assert.equal(turns[0]!.params.input.length, 1);
    const translated=translateRequest({model:'swe-2',instructions:start.baseInstructions,input:[{role:'user',content:[{type:'input_text',text:turns[0]!.params.input[0].text}]}],text:{format:{type:'json_schema',schema:turns[0]!.params.outputSchema}}},'responses','chat-completions',{encode:()=>'',decode:()=>({})});
    assert.match(JSON.stringify(translated.messages), /title/, 'field survives protocol conversion without structured-output support');
    assert.match(JSON.stringify(translated.messages), /JSON/);
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
    prompt: async (input: any) => { setTimeout(() => { publish({ type: 'turn/start', data: { turn: 1 } }); publish({ type: 'user/message', data: { id: 'title-work-input', source: { kind: 'user', rpcId: input.requestId }, content: input.content } }); publish({ type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }); }, 1); return ok({}); },
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


test('handoff summarization reuses verified isolation, never the work thread, and refuses tool requests',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'buildr-handoff-summary-'));
 try{
  const fixture=titleRpc(directory,{network:false,handoff:true});
  const result=await generateCodexTitle(fixture.rpc,{contextRef:{id:'work'},cwd:'/work',description:'用户原文和动作结果。'.repeat(700),signal:new AbortController().signal},directory,new Set(),true);
  assert.equal(result,'已检查目录，真实启动待验证。');
  const start=fixture.calls.find(c=>c.method==='thread/start')!;assert.equal(start.params.ephemeral,true);assert.equal(start.params.approvalPolicy,'never');
  const turn=fixture.calls.find(c=>c.method==='turn/start')!;assert.equal(turn.params.threadId,'aux-thread');assert.deepEqual(turn.params.outputSchema.required,['summary']);
  const refused=titleRpc(directory,{network:false,permission:true,handoff:true});
  await assert.rejects(generateCodexTitle(refused.rpc,{contextRef:{id:'work'},cwd:'/work',description:'records',signal:new AbortController().signal},directory,new Set(),true),/tools_forbidden/);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});


test('Codex title accepts a response after the former eight-second cutoff', async t => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'buildr-slow-title-'));
  try {
    t.mock.timers.enable({apis:['setTimeout']});
    const fixture=titleRpc(directory,{network:false,delay:9_000});
    const pending=generateCodexTitle(fixture.rpc,{contextRef:{id:'work'},cwd:'/work',description:'{}',signal:new AbortController().signal},directory,new Set());
    for(let i=0;i<1000&&!fixture.calls.some(call=>call.method==='turn/start');i++)await new Promise<void>(resolve=>setImmediate(resolve));
    assert.ok(fixture.calls.some(call=>call.method==='turn/start'));
    await new Promise<void>(resolve=>setImmediate(resolve));
    t.mock.timers.tick(9_000);
    assert.equal(await pending,'供应商入驻审核流程梳理');
    assert.ok(!fixture.calls.some(call=>call.method==='turn/interrupt'));
  } finally {t.mock.timers.reset();await fs.rm(directory,{recursive:true,force:true});}
});

test('Codex malformed structured title has a stable diagnostic code',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'buildr-invalid-title-'));
  try {const fixture=titleRpc(directory,{network:false,output:'invalid json'});
    await assert.rejects(generateCodexTitle(fixture.rpc,{contextRef:{id:'work'},cwd:'/work',description:'{}',signal:new AbortController().signal},directory,new Set()),/agent_title_output_invalid/);
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});


test('Codex gateway generateTitle uses tool-free /chat/completions at lowest reasoning effort without spawning an auxiliary thread', async () => {
  const http = await import('node:http');
  const { createCodexExecutor } = await import('../../../src/executors/codex/index.ts');
  const requests: Array<{ url?: string; auth?: string; body: Record<string, unknown> }> = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      requests.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(raw) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '{"title":"网关轻量标题"}' }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-codex-gw-title-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  const log = path.join(root, 'rpc.jsonl');
  const executable = path.join(root, 'codex-fixture.mjs');
  let source = await fs.readFile(new URL('./fixtures/codex-cli.mjs', import.meta.url), 'utf8');
  source = source.replace(
    "r.on('line',l=>{const m=JSON.parse(l);",
    `r.on('line',l=>{const m=JSON.parse(l);fs.appendFileSync(${JSON.stringify(log)},m.method+'\\n');`,
  );
  await fs.writeFile(executable, source);
  let runtime: AgentRuntime | undefined;
  try {
    runtime = await createCodexExecutor().open({
      connectionId: 'codex',
      configRoot: path.join(root, 'profile'),
      executable,
      environment: { PATH: process.env.PATH ?? '' },
      gateway: {
        identity: 'lease-codex-gw',
        baseUrl: `http://127.0.0.1:${port}`,
        apiKey: 'gw-secret',
        models: [{
          id: 'gemini-4-carbon',
          label: 'Gemini 4 Carbon',
          maxOutputTokens: 8192,
          reasoningEfforts: [{ id: 'low', label: 'Low' }, { id: 'high', label: 'High' }],
        }],
      },
    });
    const contextRef = await runtime.createContext({ cwd: workspace });
    const beforeTitleRpc = (await fs.readFile(log, 'utf8')).trim().split('\n').filter(Boolean);
    const title = await runtime.generateTitle!({
      contextRef,
      cwd: workspace,
      description: JSON.stringify({ messages: [{ role: 'user', text: '排查模型标题超时问题' }] }),
      model: 'gemini-4-carbon',
      reasoningEffort: 'high',
      signal: new AbortController().signal,
    });
    assert.equal(title, '网关轻量标题');
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.url, '/chat/completions');
    assert.equal(requests[0]!.auth, 'Bearer gw-secret');
    assert.equal(requests[0]!.body.model, 'gemini-4-carbon');
    assert.equal(requests[0]!.body.reasoning_effort, 'low');
    assert.equal(requests[0]!.body.max_tokens, 512);
    assert.deepEqual(requests[0]!.body.tools, []);
    const afterTitleRpc = (await fs.readFile(log, 'utf8')).trim().split('\n').filter(Boolean);
    assert.deepEqual(afterTitleRpc.slice(beforeTitleRpc.length), []);
  } finally {
    await runtime?.close();
    server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('generateCodexTitle passes effort to turn/start and distinguishes timeout from cancellation', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-codex-effort-abort-'));
  try {
    const withEffort = titleRpc(directory, { network: false });
    const title = await generateCodexTitle(
      withEffort.rpc,
      { contextRef: { id: 'work' }, cwd: '/work', description: '{}', signal: new AbortController().signal },
      directory,
      new Set(),
      false,
      'low',
    );
    assert.equal(title, '供应商入驻审核流程梳理');
    const turn = withEffort.calls.find(call => call.method === 'turn/start')!;
    assert.equal(turn.params.effort, 'low');

    const timeoutRpc = titleRpc(directory, { network: false, delay: 500 });
    const timeoutController = new AbortController();
    const pendingTimeout = generateCodexTitle(
      timeoutRpc.rpc,
      { contextRef: { id: 'work' }, cwd: '/work', description: '{}', signal: timeoutController.signal },
      directory,
      new Set(),
    );
    setTimeout(() => timeoutController.abort(new Error('agent_title_timeout')), 10);
    await assert.rejects(
      pendingTimeout,
      err => err instanceof Error && err.message === 'agent_title_timeout' && err.name !== 'AbortError',
    );

    const cancelRpc = titleRpc(directory, { network: false, delay: 500 });
    const cancelController = new AbortController();
    const pendingCancel = generateCodexTitle(
      cancelRpc.rpc,
      { contextRef: { id: 'work' }, cwd: '/work', description: '{}', signal: cancelController.signal },
      directory,
      new Set(),
    );
    setTimeout(() => cancelController.abort(), 10);
    await assert.rejects(
      pendingCancel,
      err => err instanceof Error && err.message === 'agent_title_cancelled' && err.name === 'AbortError',
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
