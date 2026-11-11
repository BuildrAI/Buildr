import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createCipheriv, createHash, randomUUID } from 'node:crypto';
import { createQoderCnExecutor } from '../../../build/executors/qoder-cn/index.js';
import { readNativeTool } from '../../../src/executors/index.ts';
import type { AgentRuntime, ExecutorEvent, ExecutorItem } from '../../../src/contracts.ts';

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
    const items = latestItems(events);
    assert.deepEqual(items.map(item => item.kind), ['message', 'message', 'thinking', 'tool', 'message']);
    assert.equal(items[0]!.text, '查看文件', 'native user echoes must not duplicate admitted input');
    assert.equal(items.at(-1)!.text, 'fixture answer');
    assert.equal(items.at(-1)!.status, 'completed', 'final answer must leave the process block');
    assert.equal(items[3]!.name, '读取文件', 'status-only updates preserve tool identity');
    assert.equal(items[3]!.input, '{"path":"fixture.txt"}');
    assert.equal(items[3]!.text, '文件已读取');
    assert.ok(events.some(event => event.type === 'completed' && event.status === 'completed'));
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

test('Qoder CN settles a tool cancelled while waiting for approval and accepts the next input', { timeout: 15000 }, async () => {
  await withRuntime(async ({ runtime, config, workspace, contextRef }) => {
    await writeFile(join(config, 'scenario'), 'stop-approval-pending');
    const events: ExecutorEvent[] = [];
    const sending = runtime.send({ contextRef, cwd: workspace, text: '等待批准', images: [], clientRequestId: 'approval-stop', onEvent: event => events.push(event) });
    sending.catch(() => {});
    await eventually(() => events.some(event => event.type === 'request'));
    const stopped = await runtime.stop({ contextRef, executionRef: { id: 'approval-stop' } });
    await sending;
    assert.equal(stopped.status, 'stopped');
    const observed = await runtime.observe({ contextRef });
    assert.equal(observed.status, 'stopped');
    assert.ok(observed.tools.every(tool => tool.status === 'completed'), 'a tool cancelled at approval never ran and must settle');
    const tool = latestItems(events).find(item => item.kind === 'tool');
    assert.equal(tool?.status, 'completed');
    assert.match(tool?.text ?? '', /未执行/, 'the display must honestly say the tool did not run');
    assert.ok(events.some(event => event.type === 'completed' && event.status === 'stopped'));
    // The reported bug: the conversation was permanently rejected after this stop.
    await writeFile(join(config, 'scenario'), '');
    await writeFile(join(config, 'auto-allow'), '');
    const next: ExecutorEvent[] = [];
    await runtime.send({ contextRef, cwd: workspace, text: '继续', images: [], clientRequestId: 'after-stop', onEvent: event => next.push(event) });
    assert.ok(next.some(event => event.type === 'accepted'));
    assert.equal((await runtime.observe({ contextRef })).status, 'idle');
  });
});

test('Qoder CN keeps an approved running tool unknown when cancelled without a terminal update', { timeout: 15000 }, async () => {
  await withRuntime(async ({ runtime, config, workspace, contextRef }) => {
    await writeFile(join(config, 'scenario'), 'stop-running-tool');
    const events: ExecutorEvent[] = [];
    const sending = runtime.send({ contextRef, cwd: workspace, text: '批准后运行', images: [], clientRequestId: 'running-stop', onEvent: event => events.push(event) });
    sending.catch(() => {});
    await eventually(() => events.some(event => event.type === 'request'));
    const request = events.find(event => event.type === 'request');
    assert.equal(request?.type, 'request');
    await runtime.reply({ contextRef, executionRef: { id: 'running-stop' }, requestId: request.request.id, answer: 'allow-once' });
    const stopped = await runtime.stop({ contextRef, executionRef: { id: 'running-stop' } });
    await sending.catch(() => {});
    assert.notEqual(stopped.status, 'stopped');
    const observed = await runtime.observe({ contextRef });
    assert.equal(observed.status, 'unknown', 'a genuinely running tool may still be live after cancellation');
    assert.ok(observed.tools.some(tool => tool.status !== 'completed'));
    await assert.rejects(runtime.send({ contextRef, cwd: workspace, text: '不得重发', images: [], clientRequestId: 'retry', onEvent() {} }), /unsettled/);
  });
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
    assert.equal(latestItems(events).filter(item => item.role === 'user').length, 1);
    assert.ok(!latestItems(events).some(item => item.text.includes('第一轮')), 'native load replay is not new output');
  } finally { await second.close(); await rm(root, { recursive: true, force: true }); }
});

function latestItems(events: ExecutorEvent[]): ExecutorItem[] {
  const items = new Map<string, ExecutorItem>();
  for (const event of events) if (event.type === 'item') items.set(event.item.id, event.item);
  return [...items.values()];
}

async function withRuntime(run: (input: { runtime: AgentRuntime; config: string; workspace: string; contextRef: Awaited<ReturnType<AgentRuntime['createContext']>> }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cn-alignment-'));
  const workspace = join(root, 'workspace'), configRoot = join(root, 'config');
  await mkdir(workspace);
  const runtime = await createQoderCnExecutor().open({ connectionId: 'qoder-cn', configRoot, executable: await program(root), environment: { PATH: process.env.PATH ?? '' } });
  try {
    const contextRef = await runtime.createContext({ cwd: workspace });
    await run({ runtime, config: join(configRoot, 'qoder-cn-config'), workspace, contextRef });
  } finally { await runtime.close(); await rm(root, { recursive: true, force: true }); }
}

test('Qoder CN applies native full access and restores default without answering permissions automatically', { timeout: 15000 }, async () => {
  await withRuntime(async ({ runtime, config, workspace, contextRef }) => {
    const events: ExecutorEvent[] = [];
    await runtime.send({ contextRef, cwd: workspace, text: '完全访问', images: [], clientRequestId: 'full', permissionMode: 'full-access', model: 'dfmodel', reasoningEffort: 'high', onEvent: event => events.push(event) });
    assert.ok(!events.some(event => event.type === 'request'));
    const sending = runtime.send({ contextRef, cwd: workspace, text: '默认权限', images: [], clientRequestId: 'default', permissionMode: 'default', onEvent: event => events.push(event) });
    sending.catch(() => {});
    await eventually(() => events.some(event => event.type === 'request'));
    const request = events.find(event => event.type === 'request');
    assert.equal(request?.type, 'request');
    assert.deepEqual(request.request.options?.map(option => option.id), ['allow-always', 'allow-once', 'reject-once']);
    await runtime.reply({ contextRef, executionRef: { id: 'default' }, requestId: request.request.id, answer: { approved: true } });
    await sending;
    const choices = await records(join(config, 'fixture-config-selections.jsonl'));
    assert.deepEqual(choices.filter(item => item.configId === 'mode').map(item => item.value), ['yolo', 'default']);
    assert.deepEqual(choices.filter(item => item.configId === 'reasoning_effort').map(item => item.value), ['high']);
    const permissions = await records(join(config, 'fixture-permission-responses.jsonl'));
    assert.equal((permissions[0]?.result as any)?.outcome?.optionId, 'allow-once', 'approve once cannot create a persistent grant');
    assert.deepEqual((await records(join(config, 'fixture-initialize.jsonl')))[0]?.clientCapabilities, {elicitation:{form:{}}});
  });
});

test('Qoder CN native form questions pause full-access work and preserve typed answers', {timeout:15000}, async()=>{
  await withRuntime(async({runtime,config,workspace,contextRef})=>{
    await writeFile(join(config,'scenario'),'question');
    const events:ExecutorEvent[]=[];
    const sending=runtime.send({contextRef,cwd:workspace,text:'询问业务',images:[],permissionMode:'full-access',clientRequestId:'question-owned',onEvent:event=>events.push(event)});
    sending.catch(()=>{});
    await eventually(()=>events.some(event=>event.type==='request'&&event.request.kind==='question'));
    const request=events.find(event=>event.type==='request');
    assert.equal(request?.type,'request');assert.equal(request.request.kind,'question');
    assert.equal((await runtime.observe({contextRef})).status,'waiting');
    const input={contextRef,executionRef:{id:'question-owned'},requestId:request.request.id};
    await assert.rejects(runtime.reply({...input,answer:{choice:'invalid'}}),/answer_invalid/);
    assert.equal((await runtime.observe({contextRef})).requests?.length,1);
    await runtime.reply({...input,answer:{choice:'B',features:['问答','追加'],note:'按计划实施',count:'2',confirm:'true'}});
    await sending;
    const answer=(await records(join(config,'fixture-permission-responses.jsonl')))[0]?.result;
    assert.deepEqual(answer,{action:'accept',content:{choice:'B',features:['问答','追加'],note:'按计划实施',count:2,confirm:true}});
    assert.equal((await runtime.observe({contextRef})).status,'idle');
    assert.ok(events.some(event=>event.type==='context-usage'&&event.usedTokens===2345));
  });
});

test('Qoder CN stops a native question without supplying an answer', {timeout:15000}, async()=>{
  await withRuntime(async({runtime,config,workspace,contextRef})=>{
    await writeFile(join(config,'scenario'),'question');
    const events:ExecutorEvent[]=[];
    const sending=runtime.send({contextRef,cwd:workspace,text:'询问',images:[],clientRequestId:'question-stop',onEvent:event=>events.push(event)});sending.catch(()=>{});
    await eventually(()=>events.some(event=>event.type==='request'));
    const observed=await runtime.stop({contextRef,executionRef:{id:'question-stop'}});
    await sending;
    assert.equal(observed.status,'stopped');
    assert.deepEqual((await records(join(config,'fixture-permission-responses.jsonl')))[0]?.result,{action:'cancel'});
  });
});

test('Qoder CN queues supplementary images in the same execution and confirms only their own native receipt', {timeout:15000}, async()=>{
  await withRuntime(async({runtime,config,workspace,contextRef})=>{
    await writeFile(join(config,'scenario'),'queue');
    const events:ExecutorEvent[]=[];
    const sending=runtime.send({contextRef,cwd:workspace,text:'第一条',images:[],clientRequestId:'queue-owned',onEvent:event=>events.push(event)});sending.catch(()=>{});
    await eventually(()=>events.some(event=>event.type==='request'));
    const request=events.find(event=>event.type==='request');assert.equal(request?.type,'request');
    const image=join(config,'image.png');await writeFile(image,Buffer.from('fixture-image'));
    const extra={contextRef,executionRef:{id:'queue-owned'},cwd:workspace,text:'追加说明',images:[{id:'fixture-image',path:image,mimeType:'image/png'}],clientRequestId:'extra-1'};
    const supplement=runtime.supplement!(extra);supplement.catch(()=>{});
    await eventually(()=>existsSync(join(config,'fixture-queued.jsonl')));
    await assert.rejects(runtime.supplement!({...extra,executionRef:{id:'wrong'}}),/identity_mismatch/);
    assert.ok(!events.some(event=>event.type==='item'&&event.item.clientRequestId==='extra-1'));
    assert.ok(!events.some(event=>event.type==='completed'));
    await runtime.reply({contextRef,executionRef:{id:'queue-owned'},requestId:request.request.id,answer:'allow-once'});
    const receipt=await supplement;await sending;
    assert.equal(receipt.executionRef.id,'queue-owned');
    assert.ok(receipt.inputItemId&&receipt.inputItemId!=='extra-1');
    assert.ok(events.some(event=>event.type==='item'&&event.item.clientRequestId==='extra-1'&&event.item.id===receipt.inputItemId));
    assert.equal(events.filter(event=>event.type==='completed').length,1);
    assert.equal((await records(join(config,'fixture-session-new.jsonl'))).length,1);
    const queued=await records(join(config,'fixture-queued.jsonl'));
    assert.equal(queued.length,1);
    assert.equal((queued[0]?.prompt as any[])[1]?.data,Buffer.from('fixture-image').toString('base64'));
    const tools=latestItems(events).filter(item=>item.kind==='tool');
    assert.equal(tools.length,2);
    assert.equal((await runtime.observe({contextRef})).status,'idle');
  });
});

test('Qoder CN actual ACP tool IDs resolve full durable content, not the live preview', {timeout:15000}, async()=>{
  await withRuntime(async({runtime,config,workspace,contextRef})=>{
    await writeFile(join(config,'auto-allow'),'');
    const events:ExecutorEvent[]=[];
    await runtime.send({contextRef,cwd:workspace,text:'读取详情',images:[],clientRequestId:'native-reference',onEvent:event=>events.push(event)});
    const tool=latestItems(events).find(item=>item.kind==='tool')!;
    const root=join(config,'../..','native-store'),account=join(root,'model-access/accounts/native-qoder-cn');
    await mkdir(account,{recursive:true});await cp(config,join(account,'qoder-cn-config'),{recursive:true});
    const reference={version:3 as const,provider:'qoder-cn',contextId:contextRef.id,nativeId:tool.id,entry:{...tool,id:'display-tool',text:'',sequence:1,createdAt:new Date(0).toISOString()},session:{config:'model-access/accounts/native-qoder-cn',cwd:workspace},text:[]};
    const detail=readNativeTool(root,reference);
    assert.equal(detail?.text,'native full detail '.repeat(1500));
    assert.equal(detail?.input,'{"path":"fixture.txt"}');
    assert.notEqual(detail?.text,tool.text,'detail comes from native durable result, not ACP preview');
    assert.equal(readNativeTool(root,{...reference,session:{...reference.session,config:'connections/qoder-cn'}})?.text,detail?.text,'old references use only the known CN account alias');
    assert.equal(readNativeTool(root,{...reference,session:{...reference.session,cwd:'/other'}}),undefined);
    assert.equal(readNativeTool(root,{...reference,session:{...reference.session,config:'model-access/accounts/other'}}),undefined);
    const accepted=events.find(event=>event.type==='accepted');assert.equal(accepted?.type,'accepted');
    assert.equal(accepted.executionRef.data?.resourceContext,contextRef.id);
  });
});

for(const scenario of ['queue-missing-receipt','queue-disconnect'])test(`Qoder CN ${scenario} cannot confirm a supplement or mark the run successful`,{timeout:15000},async()=>{
  await withRuntime(async({runtime,config,workspace,contextRef})=>{
    await writeFile(join(config,'scenario'),scenario);
    const events:ExecutorEvent[]=[];
    const sending=runtime.send({contextRef,cwd:workspace,text:'第一条',images:[],clientRequestId:'queue-owned',onEvent:event=>events.push(event)});sending.catch(()=>{});
    await eventually(()=>events.some(event=>event.type==='request'));
    const request=events.find(event=>event.type==='request');assert.equal(request?.type,'request');
    const supplement=runtime.supplement!({contextRef,executionRef:{id:'queue-owned'},cwd:workspace,text:'追加',images:[],clientRequestId:'unknown-extra'});supplement.catch(()=>{});
    await eventually(()=>existsSync(join(config,'fixture-queued.jsonl')));
    await runtime.reply({contextRef,executionRef:{id:'queue-owned'},requestId:request.request.id,answer:'allow-once'});
    await assert.rejects(supplement);
    await sending.catch(()=>{});
    assert.equal((await runtime.observe({contextRef})).status,'unknown');
    assert.ok(!events.some(event=>event.type==='completed'&&event.status==='completed'));
    assert.ok(!events.some(event=>event.type==='item'&&event.item.clientRequestId==='unknown-extra'));
  });
});

test('Qoder CN refuses unsupported selections and unapplied mode before admitting any input', { timeout: 15000 }, async () => {
  await withRuntime(async ({ runtime, config, workspace, contextRef }) => {
    const events: ExecutorEvent[] = [];
    const send = (extra: Partial<Parameters<AgentRuntime['send']>[0]>) => runtime.send({ contextRef, cwd: workspace, text: '不得发送', images: [], clientRequestId: randomUUID(), onEvent: event => events.push(event), ...extra });
    await assert.rejects(send({ model: 'not-authorized' }), /model_unavailable/);
    await assert.rejects(send({ reasoningEffort: 'ultra' }), /reasoning_unavailable/);
    await writeFile(join(config, 'scenario'), 'mode-not-applied');
    await assert.rejects(send({ permissionMode: 'full-access' }), /permission_not_applied/);
    assert.ok(!events.some(event => event.type === 'accepted'));
    await assert.rejects(readFile(join(config, 'fixture-prompts.jsonl')), { code: 'ENOENT' });
  });
});

test('Qoder CN keeps observed multi-turn history separate by context', { timeout: 15000 }, async () => {
  await withRuntime(async ({ runtime, config, workspace, contextRef }) => {
    const other = await runtime.createContext({ cwd: workspace });
    await writeFile(join(config, 'auto-allow'), '');
    const send = (contextRef: typeof other, id: string) => runtime.send({ contextRef, cwd: workspace, text: id, images: [], clientRequestId: id, onEvent() {} });
    await send(contextRef, 'first');
    await send(contextRef, 'second');
    assert.deepEqual((await runtime.readHistory({ contextRef, cwd: workspace })).filter(item => item.role === 'user').map(item => item.text), ['first', 'second']);
    assert.deepEqual(await runtime.readHistory({ contextRef: other, cwd: workspace }), []);
    await send(other, 'other');
    assert.deepEqual((await runtime.readHistory({ contextRef, cwd: workspace })).filter(item => item.role === 'user').map(item => item.text), ['first', 'second']);
    assert.deepEqual((await runtime.readHistory({ contextRef: other, cwd: workspace })).filter(item => item.role === 'user').map(item => item.text), ['other']);
  });
});

test('Qoder CN rejects wrong execution controls and invalid permission options without consuming the request', { timeout: 15000 }, async () => {
  await withRuntime(async ({ runtime, config, workspace, contextRef }) => {
    const other = await runtime.createContext({ cwd: workspace });
    const events: ExecutorEvent[] = [];
    const sending = runtime.send({ contextRef, cwd: workspace, text: 'identity', images: [], clientRequestId: 'owned', onEvent: event => events.push(event) });
    sending.catch(() => {});
    await eventually(() => events.some(event => event.type === 'request'));
    const request = events.find(event => event.type === 'request');
    assert.equal(request?.type, 'request');
    await assert.rejects(runtime.stop({ contextRef, executionRef: { id: 'wrong' } }), /identity_mismatch/);
    await assert.rejects(runtime.stop({ contextRef: other, executionRef: { id: 'owned' } }), /identity_mismatch/);
    await assert.rejects(runtime.reply({ contextRef, executionRef: { id: 'wrong' }, requestId: request.request.id, answer: { approved: true } }), /identity_mismatch/);
    await assert.rejects(runtime.reply({ contextRef, executionRef: { id: 'owned' }, requestId: request.request.id, answer: { optionId: 'injected-option' } }), /option_invalid/);
    await assert.rejects(runtime.reply({ contextRef, executionRef: { id: 'owned' }, requestId: request.request.id, answer: 'injected-option' }), /option_invalid/);
    assert.equal((await runtime.observe({ contextRef })).requests?.length, 1);
    await runtime.reply({ contextRef, executionRef: { id: 'owned' }, requestId: request.request.id, answer: 'allow-once' });
    await sending;
    const response = (await records(join(config, 'fixture-permission-responses.jsonl')))[0]?.result as { outcome?: { optionId?: string } } | undefined;
    assert.equal(response?.outcome?.optionId, 'allow-once');
    await assert.rejects(readFile(join(config, 'fixture-cancels.jsonl')), { code: 'ENOENT' });
  });
});

test('Qoder CN awaits the native cancellation receipt and does not infer a stop from notification', { timeout: 15000 }, async () => {
  await withRuntime(async ({ runtime, config, workspace, contextRef }) => {
    await writeFile(join(config, 'scenario'), 'cancel-delayed');
    const events: ExecutorEvent[] = [];
    const sending = runtime.send({ contextRef, cwd: workspace, text: 'cancel', images: [], clientRequestId: 'cancel-owned', onEvent: event => events.push(event) });
    sending.catch(() => {});
    await eventually(() => events.some(event => event.type === 'request'));
    const stopping = runtime.stop({ contextRef, executionRef: { id: 'cancel-owned' } });
    assert.notEqual((await runtime.observe({ contextRef })).status, 'stopped');
    assert.equal((await stopping).status, 'stopped');
    await sending;
    assert.equal((await records(join(config, 'fixture-cancels.jsonl'))).length, 1);
    assert.ok(!events.some(event => event.type === 'completed' && event.status === 'completed'));
  });
});

test('Qoder CN leaves an ignored cancellation live and sends it only once', { timeout: 20000 }, async () => {
  await withRuntime(async ({ runtime, config, workspace, contextRef }) => {
    await writeFile(join(config, 'scenario'), 'cancel-ignored');
    const events: ExecutorEvent[] = [];
    const sending = runtime.send({ contextRef, cwd: workspace, text: 'cancel', images: [], clientRequestId: 'ignored', onEvent: event => events.push(event) });
    sending.catch(() => {});
    await eventually(() => events.some(event => event.type === 'request'));
    const [one, two] = await Promise.all([runtime.stop({ contextRef, executionRef: { id: 'ignored' } }), runtime.stop({ contextRef, executionRef: { id: 'ignored' } })]);
    assert.notEqual(one.status, 'stopped'); assert.notEqual(two.status, 'stopped');
    assert.equal((await records(join(config, 'fixture-cancels.jsonl'))).length, 1);
    await assert.rejects(runtime.send({ contextRef, cwd: workspace, text: '不得重发', images: [], clientRequestId: 'retry', onEvent() {} }), /unsettled/);
    await runtime.close();
    await assert.rejects(sending);
  });
});

for (const scenario of ['truncated', 'unknown-reason', 'unsettled-tool', 'failed-tool', 'disconnect']) {
  test(`Qoder CN preserves the actual ${scenario} outcome`, { timeout: 15000 }, async () => {
    await withRuntime(async ({ runtime, config, workspace, contextRef }) => {
      await writeFile(join(config, 'scenario'), scenario);
      await writeFile(join(config, 'auto-allow'), '');
      const events: ExecutorEvent[] = [];
      const sending = runtime.send({ contextRef, cwd: workspace, text: scenario, images: [], clientRequestId: scenario, onEvent: event => events.push(event) });
      if (scenario === 'disconnect') await assert.rejects(sending); else await sending;
      const observed = await runtime.observe({ contextRef });
      assert.equal(observed.status, scenario === 'truncated' ? 'stopped' : scenario === 'failed-tool' ? 'idle' : 'unknown');
      if (scenario === 'truncated') assert.match(observed.diagnostic ?? '', /上限/);
      if (scenario === 'failed-tool') {
        assert.equal(latestItems(events).find(item => item.kind === 'tool')?.status, 'failed');
        assert.ok(observed.tools.every(tool => tool.status === 'completed'));
      } else {
        assert.ok(!events.some(event => event.type === 'completed' && event.status === 'completed'));
        if (observed.status === 'unknown') await assert.rejects(runtime.send({ contextRef, cwd: workspace, text: 'retry', images: [], clientRequestId: 'retry', onEvent() {} }), /unsettled/);
      }
    });
  });
}

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
