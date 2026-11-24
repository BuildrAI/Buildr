import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import { createNativeExecutors } from '../../src/executors/index.ts';
import { AgentServiceError } from '../../src/domain/agent-state.ts';
import type { AgentExecutor, AgentRuntime, AgentServiceOptions, ContextRef, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorSendInput, ExecutorTitleInput, LoginObservation } from '../../src/contracts.ts';
import { NativeRequestError } from '../../src/domain/error-diagnostic.ts';

export const builtinExecutors = new Map(createNativeExecutors().map(executor => [executor.descriptor.id, executor]));

export const builtinDescriptors = new Map([...builtinExecutors].map(([id, executor]) => [id, executor.descriptor]));

export type Context = { items: ExecutorItem[]; observation: ExecutorObservation; unblock?: () => void };

export function fake(id = 'local', options: { hold?: boolean; disconnect?: 'stopped'|'running'|'unknown'|'tool'; disconnectError?: string; beforeDisconnect?: Promise<void>; disconnectAlways?: boolean; disconnectOn?: number; beforeResume?: Promise<void>; resumeUnavailable?: boolean; unknown?: boolean; images?: boolean; noAnswer?: boolean; multipleModels?: boolean; request?: boolean; question?: boolean; coldUnknown?: boolean; beforeAccepted?: Promise<void>; replyAfterTerminal?: boolean; toolSurvives?: boolean; toolInput?: boolean; failure?: string | ((attempt: number) => string | undefined); prepareFailures?: number; unknownCreate?: boolean; beforeObservation?: Promise<void>; wrongObservation?: boolean; summary?:(input:ExecutorTitleInput)=>Promise<string|undefined> } = {}) {
  const contexts = new Map<string, Context>(); const sends: ExecutorSendInput[] = []; const replies: unknown[] = []; const opens: ExecutorOpenOptions[] = [];
  let preparations = 0;
  let loginUpdate: ((value: LoginObservation) => void) | undefined;
  const capabilities = { text: true, images: Boolean(options.images), approval: true, questions: true, stop: true, resume: true, maxInputBytes: 128 * 1024 };
  const get = (ref: ContextRef) => { const context = contexts.get(ref.id); assert.ok(context, 'exact context must be restored'); return context; };
  const builtin = builtinDescriptors.get(id), builtinExecutor = builtinExecutors.get(id);
  const executor: AgentExecutor = { descriptor: { id, label: id, capabilities, ...(builtin?.modelPolicy ? { modelPolicy: builtin.modelPolicy } : {}), ...(builtin?.runtimeTraits ? { runtimeTraits: builtin.runtimeTraits } : {}) }, ...(builtinExecutor?.nativeContent ? { nativeContent: builtinExecutor.nativeContent } : {}), async open(input) {
    opens.push(input);
    let didSend = false; let closed = false;
    const runtime: AgentRuntime = {
      bindingIdentity: `${id}:${input.configRoot}`, capabilities, get closed() { return closed; },
      async inspectAccount() { return { status: 'ready', label: 'local account' }; },
      async models() { return [{ id: 'test-model', label: 'test-model' }, ...(options.multipleModels ? [{id:'other-model',label:'other-model'}] : [])]; },
      async beginLogin(update) { loginUpdate = update; update({ state: 'waiting-browser', url: 'https://example.test/official?secret=temporary' }); },
      async cancelLogin() {},
      async createContext() { if (++preparations <= (options.prepareFailures ?? 0)) throw options.unknownCreate ? new Error('agent_native_timeout') : new NativeRequestError('service temporarily unavailable'); const ref = { id: randomUUID() }; contexts.set(ref.id, { items: [], observation: { status: 'idle', tools: [] } }); return ref; },
      async resumeContext({ contextRef }) {
        if (options.resumeUnavailable) { const { AgentServiceError } = await import('../../src/index.ts'); throw new AgentServiceError('agent_context_unavailable', '原原生会话已无法恢复，将建立新的原生会话继续本轮；此前对话记录与输入已保留。'); }
        if (opens.length > 1) await options.beforeResume; get(contextRef);
      },
      async readHistory({ contextRef }) { return structuredClone(get(contextRef).items); },
      async send(input) {
        didSend = true;
        sends.push(input); const context = get(input.contextRef); const executionRef = { id: `execution-${sends.length}` };
        await options.beforeAccepted;
        if (options.unknown) { context.observation = { status: 'unknown', tools: [] }; throw new Error('acceptance reply lost'); }
        context.observation = { status: 'running', executionRef, tools: [] };
        input.onEvent({ type: 'accepted', executionRef, inputItemId: `input-${sends.length}` });
        const user: ExecutorItem = { id: `input-${sends.length}`, kind: 'message', role: 'user', text: input.text, executionId: executionRef.id };
        context.items.push(user); input.onEvent({ type: 'item', item: user });
        if(options.request||options.question)context.observation={status:'waiting',executionRef,tools:[]};
        if(options.question)input.onEvent({type:'request',request:{id:'question-one',kind:'question',title:'处理范围',questions:[{id:'scope',label:'具体范围',allowOther:true,options:[{id:'yes',label:'确认'}]}]}});
        if (options.request) input.onEvent({ type: 'request', request: { id: 'permit-one', kind: 'approval', title: 'Write a file?', options: [{ id: 'allow-once', label: 'Allow once' }, { id: 'deny', label: 'Deny' }] } });
        if (options.disconnect && (sends.length === (options.disconnectOn ?? 1) || options.disconnectAlways)) {
          await options.beforeDisconnect;
          closed = true;
          context.observation = { status: options.disconnect === 'tool' ? 'stopped' : options.disconnect, executionRef,
            tools: options.disconnect === 'tool' ? [{id:'uncertain-tool',label:'write',status:'unknown',canStop:false}] : [] };
          throw new Error(options.disconnectError ?? 'codex_execution_observation_lost');
        }
        if (options.hold || options.request || options.question) await new Promise<void>(resolve => { context.unblock = resolve; });
        if (context.observation.status === 'stopped') { input.onEvent({ type: 'completed', status: 'stopped' }); return; }
        if (options.toolInput) {
          const invocation:ExecutorItem={id:`tool-${sends.length}`,kind:'tool',role:'system',name:'read',input:'{"file_path":"src/example.ts"}',text:'read\n{"file_path":"src/example.ts"}',executionId:executionRef.id,status:'running'};
          input.onEvent({type:'item',item:invocation});
          const result:ExecutorItem={id:invocation.id,kind:'tool',role:'system',text:'file content',executionId:executionRef.id,status:'completed'};
          context.items.push(result);input.onEvent({type:'item',item:result});
        }
        const item: ExecutorItem = { id: `answer-${sends.length}`, kind: 'message', role: 'assistant', text: `answer from ${id}`, executionId: executionRef.id, status: 'completed' };
        if (!options.noAnswer) { context.items.push(item); input.onEvent({ type: 'item', item }); }
        context.observation = options.toolSurvives ? { status: 'tools-active', executionRef, tools: [{ id: 'own-tool', label: 'owned command', status: 'running', canStop: true }] } : { status: 'idle', executionRef, tools: [] };
        const failure = typeof options.failure === 'function' ? options.failure(sends.length) : options.failure;
        input.onEvent({ type: 'completed', status: failure ? 'failed' : 'completed', ...(failure ? {diagnostic:failure} : {}) });
      },
      async observe({ contextRef }) { await options.beforeObservation; if (options.wrongObservation) return {...structuredClone(get(contextRef).observation), executionRef:{id:'wrong-execution'}}; return options.coldUnknown && !didSend ? { status: 'unknown', tools: [] } : structuredClone(get(contextRef).observation); },
      async reply({ contextRef, answer }) { if(!options.question)assert.equal(answer, 'allow-once'); replies.push(answer); const context = get(contextRef); context.unblock?.(); if (options.replyAfterTerminal) await new Promise(resolve => setTimeout(resolve, 25)); },
      async stop({ contextRef }) { const context = get(contextRef); context.observation = { ...context.observation, status: 'stopped', tools: [] }; context.unblock?.(); return context.observation; },
      summarizeHandoff:options.summary,
      async close() {},
    };
    return runtime;
  } };
  return { executor, contexts, sends, replies, opens, loginUpdate: () => loginUpdate };
}

export function fixture(executors: AgentExecutor[], settings: { taskIds?: string[]; modelProviders?: AgentServiceOptions['modelProviders']; autoContinueInterrupted?: boolean; shutdownTimeoutMs?: number; titleTimeoutMs?: number; now?: () => Date; controlSupersededRun?: AgentServiceOptions['controlSupersededRun'] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-core-'));
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  const nativeProviders:AgentServiceOptions['modelProviders']=[{id:'native-qoder',label:'Fixture Qoder',linked:true,async open(){return{protocol:'chat-completions',async inspect(){return{status:'ready',models:[{id:'test-model',label:'Test',images:false,tools:true}]};},async beginLogin(){},async cancelLogin(){},async infer(){throw Error('unused');},async close(){}};}},{id:'native-qoder-cn',label:'Fixture CN',linked:true,async open(){return{protocol:'chat-completions',async inspect(){return{status:'ready',models:[{id:'test-model',label:'Test',images:false,tools:true}]};},async beginLogin(){},async cancelLogin(){},async infer(){throw Error('unused');},async close(){}};}}];
  const options = { ...settings, modelProviders: settings.modelProviders ?? (executors.some(executor=>executor.descriptor.id==='qoder'||executor.descriptor.id==='qoder-cn') ? nativeProviders : []), dataRoot: path.join(root, 'profile'), executors, resolveWorkspace(id: string) { assert.equal(id, 'workspace-one'); return { rootPath: workspace }; }, assertTask(_id: string, taskId: string) { assert.ok((settings.taskIds ?? ['task-one']).includes(taskId), '任务不存在'); } };
  const service = createAgentService(options);
  return { root, workspace, options, service, async close() { await service.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

export async function connected(service: ReturnType<typeof createAgentService>, id: string) { const view=await service.connections.connect(id, { expectedRevision: service.connections.read(id).revision });if(id==='qoder'||id==='qoder-cn'){const accountId='native-'+id;await service.models.accounts.list({refresh:true});const checked=await service.models.accounts.check(accountId);await service.models.accounts.preferences(accountId,{expectedRevision:checked.revision,models:[{id:'test-model',enabled:true}]});}return view; }

export async function waitUntil<T>(read: () => T, predicate: (value: T) => boolean): Promise<T> {
  for (let i = 0; i < 500; i++) { const value = read(); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 2)); }
  assert.fail('observable state did not settle: ' + JSON.stringify(read()).slice(-1800));
}

export function send(service: ReturnType<typeof createAgentService>, id: string, connectionId: string, text: string, clientRequestId: string = randomUUID()) {
  const view = service.conversations.read('workspace-one', id);
  const draft = { expectedRevision: view.revision, connectionId, text };
  const preview = service.conversations.prepareSend('workspace-one', id, draft);
  return service.conversations.send('workspace-one', id, { ...draft, previewToken: preview.token, clientRequestId });
}

export function fastRetries(t: import('node:test').TestContext) {
  t.mock.method(globalThis, 'setTimeout', new Proxy(setTimeout, { apply(target, receiver, args) {
    if ([2000, 5000, 10000].includes(args[1])) args[1] = 1;
    return Reflect.apply(target, receiver, args);
  } }));
}

export const gatewayProviders: AgentServiceOptions['modelProviders'] = [{id:'fixture',label:'Fixture',async open(){return{protocol:'chat-completions',async inspect(){return{status:'ready',models:[{id:'test-model',label:'Test',images:false,tools:true}]};},async beginLogin(){},async cancelLogin(){},async infer(){throw Error('unused');},async close(){}};}}];

export async function sharedAccount(f: ReturnType<typeof fixture>) {
  const account = await f.service.models.accounts.add({provider: 'fixture'}), checked = await f.service.models.accounts.check(account.id);
  await f.service.models.accounts.preferences(account.id, {expectedRevision: checked.revision, models: [{id: 'test-model', enabled: true}]});
  return account;
}

export function sendWithAccount(f: ReturnType<typeof fixture>, conversationId: string, accountId: string, text: string) {
  const draft = {expectedRevision: f.service.conversations.read('workspace-one', conversationId).revision, connectionId: 'codex', modelAccountId: accountId, model: 'test-model', text};
  const preview = f.service.conversations.prepareSend('workspace-one', conversationId, draft);
  return f.service.conversations.send('workspace-one', conversationId, {...draft, previewToken: preview.token, clientRequestId: randomUUID()});
}

export function continueDraft(service: ReturnType<typeof createAgentService>, id:string, connectionId='local', model?:string) {
  const current=service.conversations.read('workspace-one',id);
  return {expectedRevision:current.revision, connectionId, model, text:'', continueRunId:current.run!.id};
}
