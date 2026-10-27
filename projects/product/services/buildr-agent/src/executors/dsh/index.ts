import { readFile, writeFile, rm } from 'node:fs/promises';
import { errorDiagnostic } from '../../domain/error-diagnostic.ts';
import { isCompatibleProgram, nativeProgramPolicy } from '../program-policy.ts';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { AgentExecutor, AgentRuntime, ContextRef, ExecutionRef, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorRequest, ExecutorSendInput, LoginObservation, PermissionMode } from '../../contracts.ts';
import { nativeBinding, bounded, findExecutable, inspectVersion, isolatedEnvironment, nativeHome, opaqueReference, parseReference, privateDirectories } from '../native-process.ts';
import { launchDshHost, dshValue, type DshClient } from './client.ts';
import { dshItem, dshHistoryItems, dshExecutionObservation } from './protocol.ts';
import { modelOptions } from '../model-options.ts';
import { applyDshPermissions, dshPermissionCatalog } from './permissions.ts';
import { AgentServiceError } from '../../domain/agent-state.ts';
import { checkedGateway, consumerBinding, gatewayModel, gatewayEffort, type ExecutorGateway } from '../model-gateway.ts';
const capabilities = { text: true, images: true, maxImageBytes: 8 * 1024 * 1024, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 96 * 1024 };
// @deepseek-ai/dsh-llm-pi-ai Config.reasoningEfforts uses these THINKING_LEVELS keys (0.2.1-rc.3).
const dshReasoningEfforts = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
export function dshGatewayModels(gateway: ExecutorGateway) {
  return gateway.models.map(model => {
    const efforts = model.reasoningEfforts?.filter(effort => dshReasoningEfforts.has(effort.id));
    return { id: model.id, name: model.label, ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}), ...(model.maxOutputTokens ? { maxTokens: model.maxOutputTokens } : {}), input: model.vision ? ['text', 'image'] : ['text'], reasoningEfforts: efforts?.length ? Object.fromEntries(efforts.map(effort => [effort.id, effort.id])) : false };
  });
}
export function dshGatewayEffort(gateway: ExecutorGateway, modelId?: string, effort?: string): string | undefined {
  const selected = gatewayEffort(gateway, modelId, effort), offered = gatewayModel(gateway, modelId).reasoningEfforts;
  if (selected && !dshReasoningEfforts.has(selected) || !selected && offered?.length && !offered.some(option => dshReasoningEfforts.has(option.id))) throw new AgentServiceError('agent_reasoning_unavailable', 'DSH 暂不支持所选推理强度，请选择其他已支持档位。');
  return selected;
}
/** An additive overlay owns only the Buildr route; the native profile stays intact. */
export async function writeGatewayPatch(directory: string, gateway: ExecutorGateway): Promise<string> {
  checkedGateway(gateway);
  const filename = join(directory, 'buildr-model-gateway.json');
  const models = dshGatewayModels(gateway);
  await writeFile(filename, JSON.stringify([{ id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: { providers: { 'buildr-models': { displayName: 'Buildr', api: 'openai-responses', baseURL: gateway.baseUrl.replace(/\/$/, ''), apiKeyEnv: 'BUILDR_MODEL_GATEWAY_KEY', models } } } }]), { mode: 0o600 });
  return filename;
}
interface ActiveTurn { id: string; input: ExecutorSendInput; nativeTurn?: number; terminal?: 'completed' | 'stopped' | 'failed'; diagnostic?: string; tools: Map<string, { id: string; label: string; status: 'running' | 'completed' | 'unknown' }>; pending: Map<string, { request: ExecutorRequest; resolve?: (value: string) => void; answer?: (value: { answers: any[] }) => void; reject?: (error: Error) => void; wait?: any }>; stream?: any; pump?: Promise<void>; streamAttempt?: { id: string; turn: number; step: number; nextIndex: number; text: string }; }
export function createDshExecutor(): AgentExecutor { return { descriptor: { id: 'dsh', label: 'DSH', capabilities }, open: options => DshRuntime.open(options) }; }
export class DshRuntime implements AgentRuntime {
  readonly capabilities = { ...capabilities, permissionModes: ['default'] as PermissionMode[] };
  private contexts = new Map<string, string>();
  private historyEvents = new Map<string, any[]>();
  private turns = new Map<string, ActiveTurn>();
  private scopes = new Map<string, any>();
  private scopeKey = Symbol('buildr.dsh.agent-scope');
  private login?: { id?: string; cancelled: boolean; update: (value: LoginObservation) => void };
  private metadata = { version: '0.2.1-rc.2', locale: 'zh-CN', timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60 };
  readonly bindingIdentity: string;
  bindingData?: Record<string, unknown>;
  private host: Awaited<ReturnType<typeof launchDshHost>>;
  private client: DshClient;
  private gateway?: ExecutorGateway;
  private modelBridge?: {key:string;addressFile:string};
  private constructor(bindingIdentity: string, host: Awaited<ReturnType<typeof launchDshHost>>, client: DshClient) { this.bindingIdentity = bindingIdentity; this.host = host; this.client = client; }
  static async open(options: ExecutorOpenOptions, ownerPatch?: string): Promise<DshRuntime> {
    options.signal?.throwIfAborted();
    const gateway = checkedGateway(options.gateway);
    const { home, temporary } = nativeHome(options.configRoot); const config = join(options.configRoot, 'dsh-home'); const agents = join(options.configRoot, 'dsh-agents-home');
    await privateDirectories(options.configRoot, home, temporary, config, agents);
    const modelBridge = !gateway&&!ownerPatch?{key:randomUUID(),addressFile:join(config,'model-bridge-'+randomUUID()+'.json')}:undefined;
    const env = isolatedEnvironment(options.environment, home, temporary, { DSH_HOME: config, DSH_AGENTS_HOME: agents, DSH_TOOLS_MODE: 'native', ...(modelBridge?{BUILDR_DSH_OWNER_KEY:modelBridge.key}:{}), ...(ownerPatch ? { BUILDR_DSH_OWNER_KEY: options.environment.BUILDR_DSH_OWNER_KEY } : {}), ...(gateway ? { BUILDR_MODEL_GATEWAY_KEY: gateway.apiKey, NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1' } : {}) });
    const executable = await findExecutable(options.executable, ['dsh', 'dsh.exe'], env); const version = await inspectVersion(executable, env, options.signal);
    if (!isCompatibleProgram('dsh', version)) throw new Error(`dsh_version_unsupported: requires ${nativeProgramPolicy('dsh').compatibility}`);
    const binding = await consumerBinding('dsh', executable, version, config, options);
    let patch = gateway ? await writeGatewayPatch(config, gateway) : ownerPatch;
    if(modelBridge){patch=join(config,'buildr-native-model-owner.json');await writeFile(patch,JSON.stringify([{insert:[{id:'buildr-deepseek-model-owner',name:fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'./model-source-plugin.ts':'./model-source-plugin.js',import.meta.url)),config:{addressFile:modelBridge.addressFile}}]}]),{mode:0o600});}
    const host = await launchDshHost(executable, env, options.configRoot, options.signal, patch);
    const runtime = new DshRuntime(binding.identity, host, host.client);
    runtime.bindingData = binding.data; runtime.metadata.version = version;
    runtime.gateway = gateway; runtime.modelBridge=modelBridge;
    try {
      host.client.ctx.typert.contexts.registerClient('agent', {
        identity: (candidate: any) => candidate?.[runtime.scopeKey],
        resolve: (id: string) => {
          if (!runtime.scopes.has(id)) runtime.scopes.set(id, host.client.ctx.extend({ [runtime.scopeKey]: id }));
          return runtime.scopes.get(id);
        },
      });
      host.client.remote.$on('approval/request', (request: any) => runtime.approval(request));
      host.client.remote.$on('user-questions/request', (request: any) => runtime.question(request));
      host.child.once('exit', () => {
        for (const turn of runtime.turns.values()) if (!turn.terminal) { turn.input.onEvent({ type: 'observation', observation: { status: 'unknown', tools: [...turn.tools.values()], diagnostic: 'dsh_host_closed' } }); }
      });
      const catalog = await dshPermissionCatalog(host.client.remote).catch(() => undefined);
      if (catalog?.options.some(option => option.value === 'danger-full-access')) runtime.capabilities.permissionModes.push('full-access');
      if (gateway) {
        const models = dshValue(await host.client.remote.session.modelCatalog());
        if (!models.groups?.some((group: any) => group.id === 'buildr-models' && group.models?.some((model: any) => model.id === gateway.models[0].id))) throw new Error('dsh_gateway_route_unavailable');
      }
      options.signal?.throwIfAborted();
      return runtime;
    } catch (error) { await host.close(); throw error; }
  }
  private reference(context: ContextRef, cwd?: string): string {
    const saved = this.contexts.get(context.id) ?? (typeof context.data?.cwd === 'string' ? context.data.cwd : undefined);
    if (!saved || cwd && saved !== cwd) throw new Error('agent_context_binding_mismatch');
    if (parseReference(String(context.data?.native ?? ''), 'dsh', saved, this.bindingIdentity).nativeSessionId !== context.id) throw new Error('agent_context_binding_mismatch');
    this.contexts.set(context.id, saved); return saved;
  }
  private context(id: string, cwd: string): ContextRef { this.contexts.set(id, cwd); return { id, data: { cwd, native: opaqueReference('dsh', id, cwd, this.bindingIdentity) } }; }
  async inspectAccount() {
    if (this.gateway) return { status: 'ready' as const, label: this.gateway.models[0].label, loginMethod: 'Buildr 模型连接' };
    const state = dshValue(await this.client.remote.account.getState());
    if (state.status !== 'credential-stored') return { status: state.status === 'session-expired' ? 'expired' as const : 'not-authenticated' as const };
    const profile = dshValue(await this.client.remote.account.getProfile(this.metadata));
    return profile?.status === 'ready' ? { status: 'ready' as const, label: 'DeepSeek', loginMethod: 'DeepSeek 账号' } : { status: 'failed' as const, diagnostic: 'dsh_account_profile_unavailable' };
  }
  async modelIdentity():Promise<string> { const profile=dshValue(await this.client.remote.account.getProfile(this.metadata)); return 'dsh:'+String(profile?.value?.id??(()=>{throw new Error('dsh_account_identity_missing');})()); }
  async requestModel(path:string,init:RequestInit={},expectedIdentity?:string):Promise<Response>{
    if(!this.modelBridge||!['/models','/anthropic/v1/messages'].includes(path))throw new Error('dsh_model_target_invalid');
    if(expectedIdentity&&createHash('sha256').update(await this.modelIdentity()).digest('hex')!==expectedIdentity)throw new Error('model_identity_conflict');
    const address=JSON.parse(await readFile(this.modelBridge.addressFile,'utf8'));if(!Number.isInteger(address.port)||address.port<1||address.port>65535)throw new Error('dsh_bridge_unavailable');
    return fetch('http://127.0.0.1:'+address.port+path,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),authorization:'Bearer '+this.modelBridge.key},redirect:'error'});
  }
  async models() {
    if (this.gateway) return structuredClone(this.gateway.models);
    const catalog = dshValue(await this.client.remote.session.modelCatalog());
    return (catalog.groups ?? []).flatMap((group: any) => (group.models ?? []).filter((model: any) => typeof model.id === 'string').map((model: any) => modelOptions({ id: `${group.id}::${model.id}`, label: String(model.label ?? model.name ?? model.id), ...(catalog.default?.provider === group.id && catalog.default?.model === model.id ? { isDefault: true } : {}) }, model.reasoning?.efforts?.map((effort: any) => ({ id: effort.id, label: effort.name ?? effort.id })), catalog.default?.provider === group.id && catalog.default?.model === model.id ? catalog.default.reasoningEffort ?? model.reasoning?.defaultEffort : model.reasoning?.defaultEffort)));
  }
  async beginLogin(update: (value: LoginObservation) => void): Promise<void> {
    if (this.gateway) { update({ state: 'failed', diagnostic: 'agent_gateway_login_managed_by_model_account' }); return; }
    await this.cancelLogin(); const login = { cancelled: false, update, id: undefined as string | undefined }; this.login = login; update({ state: 'initializing' });
    try {
    let state = dshValue(await this.client.remote.account.startSignIn(this.metadata, this.client.origin, 'web'));
    login.id = state.attempt?.id;
    if (this.login !== login) { if (login.id) await bounded(this.client.remote.account.cancelSignIn(login.id), 2000).catch(() => {}); return; }
    const deadline = Date.now() + 15 * 60 * 1000; let last = '';
    while (this.login === login && !login.cancelled && Date.now() < deadline) {
      if (state.status === 'credential-stored') { update({ state: 'checking' }); const account = await this.inspectAccount(); update({ state: account.status === 'ready' ? 'completed' : 'failed' }); this.login = undefined; return; }
      const attempt = state.attempt;
      if (attempt?.id) login.id = attempt.id;
      if (attempt?.authorizeUrl) {
        const url = new URL(attempt.authorizeUrl);
        if (url.protocol !== 'https:' || !['platform.deepseek.com', 'chat.deepseek.com', 'auth.deepseek.com', 'accounts.deepseek.com'].includes(url.hostname)) throw new Error('dsh_login_url_invalid');
        if (last !== url.href) { update({ state: 'waiting-browser', url: url.href }); last = url.href; }
      }
      if (['failed', 'cancelled', 'expired'].includes(attempt?.phase)) { update({ state: attempt.phase }); this.login = undefined; return; }
      await new Promise(resolve => setTimeout(resolve, 500));
      if (this.login !== login) return;
      state = dshValue(await this.client.remote.account.getState());
    }
    if (this.login === login) { this.login = undefined; login.cancelled = true; if (login.id) await bounded(this.client.remote.account.cancelSignIn(login.id), 2000).catch(() => {}); update({ state: 'expired' }); }
    } catch {
      if (this.login === login) { this.login = undefined; login.cancelled = true; if (login.id) await bounded(this.client.remote.account.cancelSignIn(login.id), 2000).catch(() => {}); update({ state: 'failed', diagnostic: 'dsh_login_failed' }); }
    }
  }
  async cancelLogin(): Promise<void> {
    const login = this.login; if (!login) return; this.login = undefined; login.cancelled = true;
    if (login.id) await bounded(this.client.remote.account.cancelSignIn(login.id), 2000).catch(() => {});
    login.update({ state: 'cancelled' });
  }
  async createContext({ cwd }: { cwd: string }): Promise<ContextRef> {
    const created = dshValue(await this.client.remote.session.create({ cwd, agentPreset: 'standard' }));
    const context = this.context(created.sessionId, cwd); await this.resumeContext({ contextRef: context, cwd }); return context;
  }
  private async snapshot(id: string): Promise<any> {
    const stream = this.client.remote.session.follow({ address: { kind: 'session', sessionId: id }, maxMessages: 200 });
    try { return await bounded((async () => { for await (const frame of stream) if (frame.type === 'snapshot') return frame; throw new Error('dsh_snapshot_missing'); })(), 15000); }
    finally { await stream.dispose(); }
  }
  async resumeContext({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<void> {
    this.reference(contextRef, cwd); const opening = await this.snapshot(contextRef.id);
    if (opening.header.id !== contextRef.id || opening.header.cwd !== cwd) throw new Error('dsh_context_identity_mismatch');
  }
  async readHistory({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<ExecutorItem[]> {
    this.reference(contextRef, cwd); const opening = await this.snapshot(contextRef.id);
    if (opening.header.id !== contextRef.id || opening.header.cwd !== cwd) throw new Error('dsh_context_identity_mismatch');
    let beforeSeq: number | undefined; let records: any[] = [];
    do {
      const page = dshValue(await this.client.remote.session.page({ address: { kind: 'session', sessionId: contextRef.id }, throughSeq: opening.cursor, ...(beforeSeq !== undefined ? { beforeSeq } : {}), maxMessages: 200 }));
      records = [...page.records, ...records];
      if (!page.hasMore || !page.records.length) break;
      const cursor = Math.min(...page.records.map((record: any) => record.event.seq));
      if (beforeSeq !== undefined && cursor >= beforeSeq) throw new Error('dsh_history_cursor_invalid'); beforeSeq = cursor;
    } while (records.length < 20000);
    if (records.length >= 20000) throw new Error('dsh_history_limit_exceeded');
    const events = records.map(record => record.event); this.historyEvents.set(contextRef.id, events);
    return dshHistoryItems(events);
  }
  async readTitle({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<string | undefined> {
    this.reference(contextRef, cwd);
    return this.historyEvents.get(contextRef.id)?.findLast(event => event.type === 'session/title' && event.data?.source?.kind === 'provider' && typeof event.data.title === 'string')?.data.title;
  }
  async send(input: ExecutorSendInput): Promise<void> {
    this.reference(input.contextRef, input.cwd);
    if (this.turns.has(input.contextRef.id) && !this.turns.get(input.contextRef.id)!.terminal) throw new Error('agent_native_turn_active');
    const previous = this.turns.get(input.contextRef.id); if (previous?.stream) { await previous.stream.dispose(); await previous.pump; }
    await applyDshPermissions(this.client.remote, input.contextRef.id, input.permissionMode, () => this.snapshot(input.contextRef.id));
    if (this.gateway) {
      const model = gatewayModel(this.gateway, input.model);
      const effort = dshGatewayEffort(this.gateway, input.model, input.reasoningEffort);
      dshValue(await this.client.remote.session.selectModel({ sessionId: input.contextRef.id, provider: 'buildr-models', model: model.id, ...(effort ? { reasoningEffort: effort } : {}) }));
    } else if (input.model) {
      const split = input.model.indexOf('::'); if (split < 1) throw new Error('dsh_model_identity_invalid');
      dshValue(await this.client.remote.session.selectModel({ sessionId: input.contextRef.id, provider: input.model.slice(0, split), model: input.model.slice(split + 2), ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}) }));
      input.onEvent({ type: 'models', models: await this.models() });
    }
    const turn: ActiveTurn = { id: input.clientRequestId, input, tools: new Map(), pending: new Map() }; this.turns.set(input.contextRef.id, turn);
    const stream = this.client.remote.session.follow({ address: { kind: 'session', sessionId: input.contextRef.id }, maxMessages: 200, assistantStream: true }); turn.stream = stream;
    let ready!: () => void; let finish!: () => void; let fail!: (error: Error) => void;
    const opening = new Promise<void>(resolve => { ready = resolve; }); const terminal = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; }); terminal.catch(() => {});
    let accepted = false; const buffer: any[] = [];
    const pump = (async () => {
      try {
        for await (const frame of stream) {
          if (frame.type === 'snapshot') { ready(); continue; }
          if (frame.type === 'assistant-stream') { if (accepted) this.assistantFrame(turn, frame.frame); else buffer.push({ buildrStream: frame.frame }); continue; }
          if (frame.type !== 'event') continue;
          if (!accepted) buffer.push(frame.event); else { this.event(turn, frame.event); if (turn.terminal) finish(); }
        }
        if (!turn.terminal) throw new Error('dsh_follow_closed');
      } catch { if (!turn.terminal) fail(new Error('dsh_execution_observation_lost')); ready(); }
    })();
    turn.pump = pump;
    try {
      await bounded(opening, 15000); dshValue(await bounded(this.client.remote.session.prompt({ sessionId: input.contextRef.id, requestId: input.clientRequestId, mode: 'queue', content: [{ type: 'text', text: input.text }, ...await Promise.all(input.images.map(async image => ({ type: 'image' as const, mediaType: image.mimeType as 'image/png'|'image/jpeg'|'image/webp'|'image/gif', data: (await readFile(image.path)).toString('base64') })))] }), 5000));
      input.onEvent({ type: 'accepted', executionRef: { id: turn.id } }); accepted = true;
      for (const event of buffer) { if (event.buildrStream) this.assistantFrame(turn, event.buildrStream); else this.event(turn, event); if (turn.terminal) finish(); }
      await terminal;
    } finally {
      // The original follow remains owned until the next send/close so a provider title
      // arriving after turn/end can update the same conversation without a model request.
      if (!turn.terminal) { await stream.dispose(); await pump; turn.stream = undefined; }
    }
  }
  private assistantFrame(turn: ActiveTurn, frame: any): void {
    if (frame.type === 'start') { turn.streamAttempt = { id: frame.attemptId, turn: frame.turn, step: frame.step, nextIndex: 0, text: '' }; return; }
    const attempt = turn.streamAttempt;
    if (!attempt || frame.attemptId !== attempt.id) return;
    if (frame.type === 'chunk') {
      if (frame.index !== attempt.nextIndex) return;
      attempt.nextIndex++;
      if (frame.chunk?.type === 'text-delta') {
        attempt.text += String(frame.chunk.text ?? '');
        turn.input.onEvent({ type: 'item', item: { id: `assistant:${attempt.turn}:${attempt.step}`, kind: 'message', role: 'assistant', text: attempt.text, executionId: turn.id, status: 'running' } });
      }
    }
    if (frame.type === 'end') turn.streamAttempt = undefined;
  }
  private event(turn: ActiveTurn, event: any): void {
    const data = event.data ?? {}; const emit = turn.input.onEvent;
    if (event.type === 'session/title') {
      if (data.source?.kind === 'provider' && typeof data.title === 'string') {
        const events = this.historyEvents.get(turn.input.contextRef.id) ?? []; events.push(event); this.historyEvents.set(turn.input.contextRef.id, events);
        emit({ type: 'title', title: data.title });
      }
      return;
    }
    if (turn.terminal) return;
    if (event.type === 'turn/start') turn.nativeTurn = data.turn;
    if (turn.nativeTurn !== undefined && data.turn !== undefined && data.turn !== turn.nativeTurn) return;
    for (const item of dshItem(event)) emit({ type: 'item', item: { ...item, executionId: turn.id } });
    if (event.type === 'tool/call') {
      turn.tools.set(data.callId, { id: data.callId, label: String(data.name ?? '工具'), status: 'running' });

    }
    if (event.type === 'tool/result') { const id = data.message?.toolCallId; const tool = turn.tools.get(id); if (tool) tool.status = 'completed'; }
    if (event.type === 'approval/decided') { for (const [id, pending] of turn.pending) if (pending.resolve && id === String(data.id)) { turn.pending.delete(id); emit({ type: 'request-resolved', requestId: id }); } }
    if (event.type === 'turn/end') {
      const reason = data.reason?.kind; turn.terminal = reason === 'completed' ? 'completed' : ['cancelled', 'interrupted', 'aborted'].includes(reason) ? 'stopped' : 'failed';
      if (turn.terminal === 'failed') {
        const message = errorDiagnostic(data.reason?.error?.message, this.gateway ? [this.gateway.apiKey] : []);
        turn.diagnostic = message ? `DSH · ${turn.tools.size ? '工具调用后' : '本轮执行'}：${message}` : 'dsh_turn_failed';
      }
      for (const [id, pending] of turn.pending) { pending.resolve?.('cancelled'); pending.reject?.(new Error('dsh_question_expired')); void pending.wait?.dispose(); if (turn.pending.delete(id)) emit({ type: 'request-resolved', requestId: id }); } turn.pending.clear();
      emit({ type: 'completed', status: turn.terminal, ...(turn.diagnostic ? { diagnostic: turn.diagnostic } : {}) });
    }
    emit({ type: 'observation', observation: this.activeObservation(turn) });
  }
  /** Ordinary native questions must claim the answerer waterfall before the tool can wait. */
  private async question(request: any): Promise<{ answers: any[] }> {
    const contextId = request.agent?.[this.scopeKey] ?? request.agent?.id;
    const turn = contextId ? this.turns.get(contextId) : undefined;
    if (!turn || turn.terminal || request.signal?.aborted || !Array.isArray(request.questions) || !request.questions.length) throw new Error('dsh_question_owner_unavailable');
    if (request.questions.some((question: any) => typeof question.id !== 'string' || typeof question.question !== 'string')) throw new Error('dsh_question_invalid');
    const id = typeof request.wait?.callId === 'string' ? request.wait.callId : randomUUID();
    if (turn.pending.has(id)) throw new Error('dsh_question_duplicate');
    const safe: ExecutorRequest = { id, kind: 'question', title: '需要补充信息', questions: request.questions.map((question: any) => ({ id: question.id, label: question.question, options: question.options?.map((option: any) => ({ id: option.label, label: option.label })), multiple: Boolean(question.multiSelect) })) };
    const wait = request.wait?.timed ? this.client.remote.userQuestions.attachWait(contextId, id) : undefined;
    if (wait) void (async () => { try { for await (const _ of wait) { /* Hold only this native foreground timed claim. */ } } catch { /* Native cancellation resolves the exact pending request. */ } })();
    try {
      return await new Promise((resolve, reject) => {
        const finish = (answer?: { answers: any[] }, error?: Error) => {
          if (turn.pending.get(id) !== pending) return;
          turn.pending.delete(id); request.signal?.removeEventListener('abort', abort);
          turn.input.onEvent({ type: 'request-resolved', requestId: id });
          if (error) reject(error); else resolve(answer!);
        };
        const abort = () => finish(undefined, new Error('dsh_question_cancelled'));
        const pending = { request: safe, answer: (value: { answers: any[] }) => finish(value), reject: (error: Error) => finish(undefined, error), wait };
        turn.pending.set(id, pending); request.signal?.addEventListener('abort', abort, { once: true });
        if (request.signal?.aborted) abort(); else turn.input.onEvent({ type: 'request', request: safe });
      });
    } finally { await wait?.dispose(); }
  }
  private async approval(request: any): Promise<string> {
    const id = request.agent?.[this.scopeKey] ?? request.agent?.id; const turn = id ? this.turns.get(id) : undefined;
    if (!turn || turn.terminal) return 'unavailable';
    const requestId = randomUUID(); const safe: ExecutorRequest = { id: requestId, kind: 'approval', title: `允许 ${String(request.toolName ?? '工具')}？`, description: String(request.reason ?? ''), options: [{ id: 'approve', label: '允许本次' }, { id: 'deny', label: '拒绝' }] };
    return await new Promise<string>(resolve => {
      turn.pending.set(requestId, { request: safe, resolve }); turn.input.onEvent({ type: 'request', request: safe });
      request.signal?.addEventListener('abort', () => { if (turn.pending.delete(requestId)) { resolve('cancelled'); turn.input.onEvent({ type: 'request-resolved', requestId }); } }, { once: true });
    });
  }
  private activeObservation(turn: ActiveTurn): ExecutorObservation {
    const tools = [...turn.tools.values()].map(tool => ({ ...tool, canStop: false })); return { status: turn.terminal ? tools.some(tool => tool.status === 'running') ? 'tools-active' : turn.terminal === 'stopped' ? 'stopped' : 'idle' : turn.pending.size ? 'waiting' : 'running', executionRef: { id: turn.id }, tools, requests: [...turn.pending.values()].map(value => value.request), ...(turn.diagnostic ? { diagnostic: turn.diagnostic } : {}) };
  }
  async observe({ contextRef, executionRef }: { contextRef: ContextRef; executionRef?: ExecutionRef }): Promise<ExecutorObservation> {
    this.reference(contextRef); const turn = this.turns.get(contextRef.id);
    if (turn && (!executionRef || turn.id === executionRef.id)) return this.activeObservation(turn);
    const cwd = this.reference(contextRef);
    await this.readHistory({ contextRef, cwd });
    const events = this.historyEvents.get(contextRef.id) ?? [];
    return executionRef ? dshExecutionObservation(events, executionRef.id) : { status: 'unknown', tools: [], diagnostic: 'dsh_execution_identity_required' };
  }
  async reply({ contextRef, executionRef, requestId, answer }: { contextRef: ContextRef; executionRef: ExecutionRef; requestId: string; answer: unknown }): Promise<void> {
    this.reference(contextRef); const turn = this.turns.get(contextRef.id); const pending = turn?.pending.get(requestId);
    if (!turn || turn.id !== executionRef.id || !pending || turn.terminal) throw new Error('agent_request_stale');
    if (pending.resolve) {
      if (!['approve', 'deny'].includes(String(answer))) throw new Error('agent_approval_answer_invalid'); pending.resolve(answer === 'approve' ? 'allowed-once' : 'rejected');
    } else {
      if (!answer || typeof answer !== 'object') throw new Error('agent_question_answer_invalid'); const provided = answer as Record<string, unknown>;
      const answers = (pending.request.questions ?? []).map(question => { const value = provided[question.id]; const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []; if (!values.length || values.some(item => typeof item !== 'string')) throw new Error('agent_question_answer_invalid'); const choices = new Set(question.options?.map(option => option.id) ?? []); const selected = values.filter(item => choices.has(item as string)); const custom = values.filter(item => !choices.has(item as string)).join('\n'); return { id: question.id, selected, ...(custom ? { custom } : {}) }; });
      if (!pending.answer) throw new Error('agent_request_stale');
      pending.answer({ answers });
    }
    if (turn.pending.delete(requestId)) turn.input.onEvent({ type: 'request-resolved', requestId });
  }
  async stop({ contextRef, executionRef, toolId }: { contextRef: ContextRef; executionRef: ExecutionRef; toolId?: string }): Promise<ExecutorObservation> {
    this.reference(contextRef); const turn = this.turns.get(contextRef.id);
    if (!turn || turn.id !== executionRef.id) return { status: 'unknown', tools: [], diagnostic: 'dsh_exact_live_turn_unavailable' };
    if (toolId) throw new Error('dsh_individual_tool_stop_unsupported');
    if (!turn.terminal) dshValue(await bounded(this.client.remote.session.cancel({ sessionId: contextRef.id }), 5000));
    return this.activeObservation(turn);
  }
  async close(): Promise<void> {
    await this.cancelLogin();
    await Promise.allSettled([...this.turns.values()].map(async turn => {
      if (!turn.terminal) await bounded(this.client.remote.session.cancel({ sessionId: turn.input.contextRef.id }), 1500).catch(() => {});
      for (const pending of turn.pending.values()) { pending.resolve?.('cancelled'); pending.reject?.(new Error('dsh_question_expired')); await pending.wait?.dispose(); }
      await turn.stream?.dispose(); await turn.pump;
    }));
    await this.host.close();
    if(this.modelBridge)await rm(this.modelBridge.addressFile,{force:true});
  }
}
