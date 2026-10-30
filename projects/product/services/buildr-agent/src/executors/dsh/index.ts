import { readFile, writeFile, rm } from 'node:fs/promises';
import { errorDiagnostic, NativeObservationError } from '../../domain/error-diagnostic.ts';
import { isCompatibleProgram, nativeProgramPolicy } from '../program-policy.ts';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { AgentExecutor, AgentRuntime, ContextRef, ExecutionRef, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorRequest, ExecutorSendInput, LoginObservation, PermissionMode } from '../../contracts.ts';
import { nativeBinding, visibleText, bounded, findExecutable, inspectVersion, isolatedEnvironment, nativeHome, opaqueReference, parseReference, privateDirectories } from '../native-process.ts';
import { launchDshHost, dshValue, type DshClient } from './client.ts';
import { dshBalanceQuota } from './balance.ts';
import { dshItem, dshHistoryItems, dshExecutionObservation, dshToolOutcomeUnknown } from './protocol.ts';
import { modelOptions } from '../model-options.ts';
import { applyDshPermissions, dshPermissionCatalog } from './permissions.ts';
import { AgentServiceError } from '../../domain/agent-state.ts';
import { ExecutorInputRejected, type ExecutorSupplementInput, type ExecutorInputReceipt } from '../../contracts.ts';
import { checkedGateway, consumerBinding, gatewayModel, gatewayEffort, type ExecutorGateway } from '../model-gateway.ts';
import type { ExecutorForkInput, ExecutorTitleInput } from '../../contracts.ts';
import { generateDshTitle } from './title.ts';
const capabilities = { supplement: true, text: true, images: true, maxImageBytes: 8 * 1024 * 1024, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 96 * 1024 };
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
interface ActiveTurn { accepted?: boolean; lastSeq?: number; inputIds?: Set<string>; restoring?: Promise<void>; reconnects?: number; retryTimer?: ReturnType<typeof setTimeout>; reject?: (error: Error) => void; observationDiagnostic?: string; observationLost?: boolean; stopRequested?: boolean; cancellation?: Promise<void>; supplementInputs?: Set<string>; supplementAdmissions?: number; supplementUnknown?: boolean; pendingEnd?: any; finish?: () => void; id: string; input: ExecutorSendInput; nativeTurn?: number; contextWindow?: number; terminal?: 'completed' | 'stopped' | 'failed'; diagnostic?: string; tools: Map<string, { id: string; label: string; status: 'running' | 'completed' | 'unknown' }>; pending: Map<string, { request: ExecutorRequest; resolve?: (value: string) => void; answer?: (value: { answers: any[] }) => void; reject?: (error: Error) => void; wait?: any }>; stream?: any; pump?: Promise<void>; streamAttempt?: { id: string; turn: number; step: number; nextIndex: number; text: string }; }
export function createDshExecutor(): AgentExecutor { return { descriptor: { id: 'dsh', label: 'DSH', capabilities }, open: options => DshRuntime.open(options) }; }
export class DshRuntime implements AgentRuntime {
  readonly capabilities = { ...capabilities, permissionModes: ['default'] as PermissionMode[] };
  private disposed = false;
  get closed(): boolean { return this.disposed || Boolean(this.host.child && (this.host.child.exitCode !== null || this.host.child.signalCode !== null)); }
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
  private forkBridge?: {key:string;addressFile:string;patch:string};
  private constructor(bindingIdentity: string, host: Awaited<ReturnType<typeof launchDshHost>>, client: DshClient) {
    this.bindingIdentity=bindingIdentity;this.host=host;this.client=client;
    host.child?.once('exit',()=>{
      for(const turn of this.turns.values())if(!turn.terminal){
        if(turn.retryTimer){clearTimeout(turn.retryTimer);turn.retryTimer=undefined;}
        this.followFailed(turn,new Error('dsh_host_closed'));
      }
    });
  }
  private executionReference(id:string,contextId:string):ExecutionRef {
    return this.host.control?.executionRef(id,contextId,this.bindingIdentity)??{id};
  }
  static async open(options: ExecutorOpenOptions, ownerPatch?: string): Promise<DshRuntime> {
    options.signal?.throwIfAborted();
    const gateway = checkedGateway(options.gateway);
    const { home, temporary } = nativeHome(options.configRoot); const config = join(options.configRoot, 'dsh-home'); const agents = join(options.configRoot, 'dsh-agents-home');
    await privateDirectories(options.configRoot, home, temporary, config, agents);
    const modelBridge = !gateway&&!ownerPatch?{key:randomUUID(),addressFile:join(config,'model-bridge-'+randomUUID()+'.json')}:undefined;
    const forkBridge = {key:randomUUID(),addressFile:join(config,'fork-bridge-'+randomUUID()+'.json')};
    const env = isolatedEnvironment(options.environment, home, temporary, { DSH_HOME: config, DSH_AGENTS_HOME: agents, DSH_TOOLS_MODE: 'native', BUILDR_DSH_FORK_KEY:forkBridge.key, ...(modelBridge?{BUILDR_DSH_OWNER_KEY:modelBridge.key}:{}), ...(ownerPatch ? { BUILDR_DSH_OWNER_KEY: options.environment.BUILDR_DSH_OWNER_KEY } : {}), ...(gateway ? { BUILDR_MODEL_GATEWAY_KEY: gateway.apiKey, NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1' } : {}) });
    const executable = await findExecutable(options.executable, ['dsh', 'dsh.exe'], env); const version = await inspectVersion(executable, env, options.signal);
    if (!isCompatibleProgram('dsh', version)) throw new Error(`dsh_version_unsupported: requires ${nativeProgramPolicy('dsh').compatibility}`);
    const binding = await consumerBinding('dsh', executable, version, config, options);
    let patch = gateway ? await writeGatewayPatch(config, gateway) : ownerPatch;
    if(modelBridge){patch=join(config,'buildr-native-model-owner.json');await writeFile(patch,JSON.stringify([{insert:[{id:'buildr-deepseek-model-owner',name:fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'./model-source-plugin.ts':'./model-source-plugin.js',import.meta.url)),config:{addressFile:modelBridge.addressFile}}]}]),{mode:0o600});}
    const forkPatch = join(config, 'buildr-fork-patch-'+randomUUID()+'.json');
    const patches = patch ? JSON.parse(await readFile(patch, 'utf8')) : [];
    patches.push({insert:[{id:'buildr-fork-transfer',name:fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'./fork-transfer-plugin.ts':'./fork-transfer-plugin.js',import.meta.url)),config:{addressFile:forkBridge.addressFile}}]});
    await writeFile(forkPatch, JSON.stringify(patches), {mode:0o600});
    patch = forkPatch;
    let host: Awaited<ReturnType<typeof launchDshHost>>;
    try { host = await launchDshHost(executable, env, options.configRoot, options.signal, patch); }
    catch (error) {
      await rm(forkBridge.addressFile,{force:true});
      await rm(forkPatch,{force:true});
      throw error;
    }
    const runtime = new DshRuntime(binding.identity, host, host.client);
    runtime.bindingData = binding.data; runtime.metadata.version = version;
    runtime.gateway = gateway; runtime.modelBridge=modelBridge;
    runtime.forkBridge={...forkBridge,patch:forkPatch};
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
        for (const turn of runtime.turns.values()) if (!turn.terminal) runtime.followFailed(turn, new Error('dsh_host_closed'));
      });
      const catalog = await dshPermissionCatalog(host.client.remote).catch(() => undefined);
      if (catalog?.options.some(option => option.value === 'danger-full-access')) runtime.capabilities.permissionModes.push('full-access');
      if (gateway) {
        const models = dshValue(await host.client.remote.session.modelCatalog());
        if (!models.groups?.some((group: any) => group.id === 'buildr-models' && group.models?.some((model: any) => model.id === gateway.models[0].id))) throw new Error('dsh_gateway_route_unavailable');
      }
      options.signal?.throwIfAborted();
      return runtime;
    } catch (error) { await runtime.close(); throw error; }
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
  async modelQuota() {
    try { return dshBalanceQuota(dshValue(await this.client.remote.account.getBalance(this.metadata))); }
    catch { return dshBalanceQuota(undefined); }
  }
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
  async generateTitle(input: ExecutorTitleInput): Promise<string | undefined> {
    this.reference(input.contextRef,input.cwd);
    // Ordinary native sessions already have a provider-generated title. Only
    // forks require a fresh independent title, rather than a second routine call.
    if(!input.freshInstruction)throw new Error('agent_title_unavailable');
    if(this.gateway){
      const model=gatewayModel(this.gateway);
      return generateDshTitle(input,model.id,'chat-completions',init=>fetch(this.gateway!.baseUrl.replace(/\/$/,'')+'/chat/completions',{
        ...init,headers:{...Object.fromEntries(new Headers(init.headers)),authorization:'Bearer '+this.gateway!.apiKey},redirect:'error',
      }),Math.min(128,model.maxOutputTokens??128));
    }
    const selected=input.model??(await this.models()).find((model:{id:string;isDefault?:boolean})=>model.isDefault)?.id;
    // The native account bridge is owned by DeepSeek. Never route another
    // configured native provider's selection through that account by guessing.
    if(!selected?.startsWith('deepseek::')||!this.modelBridge)throw new Error('agent_title_unavailable');
    return generateDshTitle(input,selected.slice('deepseek::'.length),'anthropic-messages',init=>this.requestModel('/anthropic/v1/messages',init));
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
  private async transferFork(action: 'export'|'import', sessionId: string, snapshot?: unknown): Promise<any> {
    if (!this.forkBridge) throw new Error('dsh_fork_bridge_unavailable');
    const address = JSON.parse(await readFile(this.forkBridge.addressFile, 'utf8'));
    if (!Number.isSafeInteger(address.port) || address.port < 1 || address.port > 65535) throw new Error('dsh_fork_address_invalid');
    const response = await fetch(`http://127.0.0.1:${address.port}/${action}`, {
      method:'POST', headers:{authorization:'Bearer '+this.forkBridge.key,'content-type':'application/json'},
      body:JSON.stringify({sessionId,snapshot}), signal:AbortSignal.timeout(30_000), redirect:'error',
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('dsh_fork_transfer_failed'); }
    return await response.json();
  }
  async forkContext(input: ExecutorForkInput): Promise<ContextRef> {
    const source = input.source;
    if (!(source instanceof DshRuntime)) throw new Error('agent_context_binding_mismatch');
    source.reference(input.contextRef, input.cwd);
    const opening = await source.snapshot(input.contextRef.id);
    if (opening.header.cwd !== input.cwd) throw new Error('agent_context_binding_mismatch');
    const events = await source.historyAt(input.contextRef.id, opening.cursor);
    const selected = events.find(event => dshItem(event).some(item => item.id === input.itemId && item.role === 'assistant'));
    const nativeTurn = selected?.data?.turn;
    const ending = events.find(event => event.type === 'turn/end' && event.data?.turn === nativeTurn);
    const executions = new Set([input.executionRef.id, ...(input.inputItemIds ?? [])]);
    if (!selected || !ending || !dshHistoryItems(events).some(item => item.id === input.itemId && executions.has(item.executionId!)))
      throw new Error('agent_fork_boundary_unavailable');
    const forked = dshValue(await source.client.remote.session.fork({sessionId:input.contextRef.id,atSeq:ending.seq}));
    if (!forked.sessionId || forked.sessionId === input.contextRef.id) throw new Error('agent_fork_identity_invalid');
    const ref = this.context(forked.sessionId, input.cwd);
    input.onCreated(ref);
    if (source !== this) {
      // Use native persistence inside the two private Hosts, not a guessed file
      // layout or a model lease belonging to the original conversation.
      const snapshot = await source.transferFork('export', forked.sessionId);
      await this.transferFork('import', forked.sessionId, snapshot);
    }
    await this.resumeContext({contextRef:ref,cwd:input.cwd});
    return ref;
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
    const original = input;
    input = { ...input, onEvent: event => {
      try { original.onEvent(event); }
      catch (error) { throw new NativeObservationError('dsh_event_observation_lost', error, this.gateway ? [this.gateway.apiKey] : []); }
    } };
    const turn: ActiveTurn = { id: input.clientRequestId, input, inputIds: new Set([input.clientRequestId]), tools: new Map(), pending: new Map() };
    this.turns.set(input.contextRef.id, turn);
    let finish!: () => void; let reject!: (error: Error) => void;
    const terminal = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; }); terminal.catch(() => {});
    turn.finish = finish; turn.reject = reject;
    const follow = this.followTurn(turn); turn.pump = follow.pump;
    try {
      await follow.opened;
      dshValue(await bounded(this.client.remote.session.prompt({ sessionId: input.contextRef.id, requestId: input.clientRequestId, mode: 'queue', content: [{ type: 'text', text: input.text }, ...await Promise.all(input.images.map(async image => ({ type: 'image' as const, mediaType: image.mimeType as 'image/png'|'image/jpeg'|'image/webp'|'image/gif', data: (await readFile(image.path)).toString('base64') })))] }), 5000));
      turn.accepted = true;
      input.onEvent({ type: 'accepted', executionRef: this.executionReference(turn.id,input.contextRef.id) });
      for (const frame of follow.buffer.splice(0)) {
        if (frame.buildrStream) this.assistantFrame(turn, frame.buildrStream);
        else { this.event(turn, frame); turn.lastSeq = frame.seq ?? turn.lastSeq; }
      }
      await terminal;
    } finally {
      // Failed observation never cancels native work. A later exact observation owns
      // reconnection; terminal followers remain available for a late native title.
      if (!turn.accepted) { await turn.stream?.dispose(); await turn.pump; turn.stream = undefined; }
    }
  }
  private followFailed(turn: ActiveTurn, cause: unknown): void {
    const error = cause instanceof NativeObservationError ? cause
      : new NativeObservationError('dsh_execution_observation_lost', cause, this.gateway ? [this.gateway.apiKey] : []);
    if (this.disposed) return;
    const changed = !turn.observationLost || turn.observationDiagnostic !== error.diagnostic;
    turn.observationLost = true; turn.observationDiagnostic = error.diagnostic;
    if (changed) try { turn.input.onEvent({ type: 'observation', observation: this.activeObservation(turn) }); } catch { /* Keep the native execution and its pending controls. */ }
    turn.reject?.(error);
    if (!turn.accepted || this.closed || (turn.reconnects ?? 0) >= 3 || turn.retryTimer) return;
    const delays = [250, 500, 1000];
    turn.retryTimer = setTimeout(() => {
      turn.retryTimer = undefined;
      if (!this.closed && turn.observationLost) void this.restoreObservation(turn).catch(() => {});
    }, delays[turn.reconnects ?? 0]);
    turn.retryTimer.unref();
  }
  private followTurn(turn: ActiveTurn, restore = false): { opened: Promise<void>; pump: Promise<void>; buffer: any[] } {
    const stream = this.client.remote.session.follow({ address: { kind: 'session', sessionId: turn.input.contextRef.id }, maxMessages: 200, assistantStream: true });
    turn.stream = stream;
    let ready!: () => void; let reject!: (error: Error) => void;
    const opening = new Promise<void>((resolve, fail) => { ready = resolve; reject = fail; }); opening.catch(() => {});
    const buffer: any[] = [];
    const pump = (async () => {
      let opened = false;
      try {
        for await (const frame of stream) {
          if (this.closed || turn.stream !== stream) break;
          if (frame.type === 'snapshot') {
            if (frame.header.id !== turn.input.contextRef.id || frame.header.cwd !== turn.input.cwd) throw new Error('dsh_context_identity_mismatch');
            if (restore) await this.restoreSnapshot(turn, frame);
            else turn.lastSeq = frame.cursor;
            opened = true; ready(); continue;
          }
          if (frame.type === 'assistant-stream') { if (turn.accepted) this.assistantFrame(turn, frame.frame); else buffer.push({ buildrStream: frame.frame }); continue; }
          if (frame.type !== 'event') continue;
          if (!turn.accepted) buffer.push(frame.event);
          else if (frame.event.seq === undefined || frame.event.seq > (turn.lastSeq ?? -1)) {
            this.event(turn, frame.event); turn.lastSeq = frame.event.seq ?? turn.lastSeq; turn.reconnects = 0;
          }
        }
        if (!this.closed && !turn.terminal) throw new Error('dsh_follow_closed');
        if (!opened) reject(new Error('dsh_snapshot_missing'));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('dsh_follow_closed'));
        if (!this.closed) this.followFailed(turn, error);
      } finally { try { await stream.dispose(); } catch {} }
    })();
    const opened = bounded(opening, 15000).catch(async error => {
      if (!this.closed && turn.stream === stream) this.followFailed(turn, error);
      try { await stream.dispose(); } catch {}
      throw error;
    });
    return { opened, pump, buffer };
  }
  private restoreObservation(turn: ActiveTurn): Promise<void> {
    if (turn.restoring) return turn.restoring;
    const work = (async () => {
      if (turn.retryTimer) { clearTimeout(turn.retryTimer); turn.retryTimer = undefined; }
      await turn.stream?.dispose(); await turn.pump;
      if (this.closed) throw new Error('dsh_host_closed');
      turn.reconnects = (turn.reconnects ?? 0) + 1;
      try {
        const follow = this.followTurn(turn, true); turn.pump = follow.pump;
        await follow.opened;
      } catch (error) {
        if (!this.closed) this.followFailed(turn, error);
        throw error;
      }
    })();
    turn.restoring = work;
    void work.finally(() => { if (turn.restoring === work) turn.restoring = undefined; }).catch(() => {});
    return work;
  }
  private async historyAt(contextId: string, cursor: number): Promise<any[]> {
    const records: any[] = []; let beforeSeq: number | undefined;
    do {
      const page = dshValue(await bounded(this.client.remote.session.page({ address: { kind: 'session', sessionId: contextId }, throughSeq: cursor, ...(beforeSeq !== undefined ? { beforeSeq } : {}), maxMessages: 200 }), 5000));
      records.unshift(...page.records);
      if (!page.hasMore || !page.records.length) return records.map(record => record.event);
      const next = Math.min(...page.records.map((record: any) => record.event.seq));
      if (beforeSeq !== undefined && next >= beforeSeq) throw new Error('dsh_history_cursor_invalid');
      beforeSeq = next;
    } while (records.length < 20000);
    throw new Error('dsh_history_limit_exceeded');
  }
  private async restoreSnapshot(turn: ActiveTurn, opening: any): Promise<void> {
    const events = await this.historyAt(turn.input.contextRef.id, opening.cursor);
    this.historyEvents.set(turn.input.contextRef.id, events);
    const owned = new Set<number>(); let current: number | undefined;
    for (const event of events) {
      if (event.type === 'turn/start') current = event.data.turn;
      if (event.type === 'user/message' && turn.inputIds?.has(event.data?.source?.rpcId) && current !== undefined) owned.add(current);
    }
    if (turn.nativeTurn !== undefined) owned.add(turn.nativeTurn);
    // Repair durable items independently of the old in-memory projection. This also
    // repairs an event consumer that failed after mutating its native turn object.
    for (const item of dshHistoryItems(events)) if (item.executionId && turn.inputIds?.has(item.executionId)) turn.input.onEvent({ type: 'item', item });
    turn.observationLost = false; turn.observationDiagnostic = undefined;
    current = undefined;
    for (const event of events) {
      if (event.type === 'turn/start') current = event.data.turn;
      if (event.seq <= (turn.lastSeq ?? -1)) continue;
      if (event.type === 'session/title' || owned.has(event.data?.turn ?? current!)) {
        if (event.type === 'turn/end') turn.terminal = undefined;
        this.event(turn, event);
      }
      turn.lastSeq = event.seq;
    }
    turn.lastSeq = opening.cursor;
    const active = opening.assistantStream?.activeAttempt;
    if (!turn.terminal && active && owned.has(active.turn)) {
      const text = (active.stream ?? []).flatMap((record: any) =>
        record?.type === 'text-chunks' && Array.isArray(record.texts) ? record.texts.filter((text: unknown) => typeof text === 'string')
          : record?.type === 'chunk' && record.chunk?.type === 'text-delta' ? [String(record.chunk.text ?? '')] : []).join('');
      turn.streamAttempt = { id: active.attemptId, turn: active.turn, step: active.step, nextIndex: active.nextIndex, text };
      if (text) turn.input.onEvent({ type: 'item', item: { id: 'assistant:' + active.turn + ':' + active.step, kind: 'message', role: 'assistant', text, executionId: turn.id, status: 'running' } });
    }
    turn.input.onEvent({ type: 'observation', observation: this.activeObservation(turn) });
  }

  private assistantFrame(turn: ActiveTurn, frame: any): void {
    if (frame.type === 'start') { turn.streamAttempt = { id: frame.attemptId, turn: frame.turn, step: frame.step, nextIndex: 0, text: '' }; return; }
    const attempt = turn.streamAttempt;
    if (!attempt || frame.attemptId !== attempt.id) return;
    if (frame.type === 'chunk') {
      if (frame.index !== attempt.nextIndex) return;
      attempt.nextIndex++; turn.reconnects = 0;
      if (frame.chunk?.type === 'text-delta') {
        attempt.text += String(frame.chunk.text ?? '');
        turn.input.onEvent({ type: 'item', item: { id: `assistant:${attempt.turn}:${attempt.step}`, kind: 'message', role: 'assistant', text: attempt.text, executionId: turn.id, status: 'running' } });
      }
    }
    if (frame.type === 'end') turn.streamAttempt = undefined;
  }
  async supplement(input: ExecutorSupplementInput): Promise<ExecutorInputReceipt> {
    this.reference(input.contextRef, input.cwd);
    const turn = this.turns.get(input.contextRef.id);
    if (!turn || turn.terminal || turn.stopRequested || turn.id !== input.executionRef.id) throw new ExecutorInputRejected('agent_supplement_stale');
    turn.inputIds?.add(input.clientRequestId);
    turn.supplementInputs ??= new Set(); turn.supplementInputs.add(input.clientRequestId);
    turn.supplementAdmissions = (turn.supplementAdmissions ?? 0) + 1;
    try {
      const content = [{ type: 'text', text: input.text }, ...await Promise.all(input.images.map(async image => ({ type: 'image', mediaType: image.mimeType, data: (await readFile(image.path)).toString('base64') })))];
      if (turn.terminal || turn.stopRequested) throw new ExecutorInputRejected('agent_supplement_stale');
      const result = await bounded(this.client.remote.session.prompt({ sessionId: input.contextRef.id, requestId: input.clientRequestId, mode: 'steer', content }), 5000);
      if (!(result as any)?.ok) throw new ExecutorInputRejected('agent_supplement_rejected');
      if (!(result as any).value?.accepted) throw new Error('dsh_supplement_receipt_missing');
      return { executionRef: { id: turn.id } };
    } catch (error) {
      if (error instanceof ExecutorInputRejected) { turn.supplementInputs.delete(input.clientRequestId); turn.inputIds?.delete(input.clientRequestId); }
      else turn.supplementUnknown = true;
      throw error;
    } finally {
      turn.supplementAdmissions--;
      if (turn.stopRequested) await this.cancelSteering(turn).catch(() => { turn.supplementUnknown = true; });
      if (!turn.supplementAdmissions && !turn.supplementInputs.size && turn.pendingEnd) { const end = turn.pendingEnd; turn.pendingEnd = undefined; this.event(turn, end); }
    }
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
    if (turn.terminal && event.type !== 'tool/result') return;
    if (event.type === 'turn/start') { turn.nativeTurn = data.turn; turn.pendingEnd = undefined; if (turn.stopRequested) void this.cancelSteering(turn).catch(() => { turn.supplementUnknown = true; }); }
    if (turn.nativeTurn !== undefined && data.turn !== undefined && data.turn !== turn.nativeTurn) return;
    if (event.type === 'request/context' && Number.isSafeInteger(data.contextWindow) && data.contextWindow > 0) turn.contextWindow = data.contextWindow;
    if (event.type === 'assistant/message' && data.usage && Number.isSafeInteger(data.usage.inputTokens) && data.usage.inputTokens >= 0) {
      emit({ type: 'context-usage', usedTokens: data.usage.inputTokens, ...(turn.contextWindow ? { windowTokens: turn.contextWindow } : {}) });
    }
    if (event.type === 'user/message' && turn.supplementInputs?.delete(data.source?.rpcId)) { turn.pendingEnd = undefined; if (!turn.supplementInputs.size) turn.supplementUnknown = false; }
    if (event.type === 'turn/end' && ((turn.supplementAdmissions ?? 0) > 0 || turn.supplementInputs?.size)) { turn.pendingEnd = event; if (turn.stopRequested) turn.supplementUnknown = true; emit({ type: 'observation', observation: this.activeObservation(turn) }); return; }
    for (const item of dshItem(event)) emit({ type: 'item', item: { ...item, executionId: turn.id } });
    if (event.type === 'tool/call') {
      turn.tools.set(data.callId, { id: data.callId, label: String(data.name ?? '工具'), status: 'running' });

    }
    if (event.type === 'tool/result') { const id = data.message?.toolCallId; const tool = turn.tools.get(id); if (tool) tool.status = dshToolOutcomeUnknown(event)?'unknown':'completed'; }
    if (event.type === 'approval/decided') { for (const [id, pending] of turn.pending) if (pending.resolve && id === String(data.id)) { turn.pending.delete(id); emit({ type: 'request-resolved', requestId: id }); } }
    if (event.type === 'turn/end') {
      const reason = data.reason?.kind; turn.terminal = reason === 'completed' ? 'completed' : ['cancelled', 'interrupted', 'aborted'].includes(reason) ? 'stopped' : 'failed';
      if (turn.terminal === 'failed') {
        const message = errorDiagnostic(data.reason?.error?.message, this.gateway ? [this.gateway.apiKey] : []);
        turn.diagnostic = message ? `DSH · ${turn.tools.size ? '工具调用后' : '本轮执行'}：${message}` : 'dsh_turn_failed';
      }
      for (const [id, pending] of turn.pending) { pending.resolve?.('cancelled'); pending.reject?.(new Error('dsh_question_expired')); void pending.wait?.dispose(); if (turn.pending.delete(id)) emit({ type: 'request-resolved', requestId: id }); } turn.pending.clear();
      emit({ type: 'completed', status: turn.terminal, ...(turn.diagnostic ? { diagnostic: turn.diagnostic } : {}) });
      turn.finish?.();
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
    const safe: ExecutorRequest = { id, kind: 'question', title: '需要补充信息', questions: request.questions.map((question: any) => ({ id: question.id, label: question.question, options: question.options?.map((option: any) => ({ id: option.label, label: option.label, ...(typeof option.description === 'string' ? { description: option.description } : {}) })), multiple: Boolean(question.multiSelect) })) };
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
  /** Native cancel retains its inbox; remove only this execution's unconsumed inputs. */
  private cancelSteering(turn: ActiveTurn): Promise<void> {
    if (turn.cancellation) return turn.cancellation;
    const contextId=turn.input.contextRef.id;
    const work=(async()=>{
      if (this.turns.get(contextId)!==turn) return;
      dshValue(await bounded(this.client.remote.session.cancel({sessionId:contextId}),5000));
      if (turn.supplementInputs?.size) {
        const projection:any=dshValue(await bounded(this.client.remote.session.projections({sessionId:contextId}),5000));
        if (projection?.kind!=='sequenced'||!projection.values?.inbox) throw new Error('dsh_pending_input_observation_missing');
        const inbox=projection.values.inbox;
        for (const message of [...(inbox['next-step']??[]),...(inbox['next-turn']??[])]) {
          const requestId=message.source?.rpcId;
          if (!turn.supplementInputs.has(requestId)) continue;
          turn.input.onEvent({type:'item',item:{id:message.id,clientRequestId:requestId,kind:'message',role:'user',text:visibleText(message.content),executionId:turn.id,status:'completed'}});
          dshValue(await bounded(this.client.remote.session.updateQueue({sessionId:contextId,itemId:message.id,action:{kind:'remove'}}),5000));
          turn.supplementInputs.delete(requestId);
        }
      }
      turn.supplementUnknown=Boolean(turn.supplementInputs?.size||(turn.supplementAdmissions??0)>0);
      if (!turn.supplementUnknown&&turn.pendingEnd) { const end=turn.pendingEnd;turn.pendingEnd=undefined;this.event(turn,end); }
    })().finally(()=>{if(turn.cancellation===work)turn.cancellation=undefined;});
    turn.cancellation=work;return work;
  }
  private activeObservation(turn: ActiveTurn): ExecutorObservation {
    const tools = [...turn.tools.values()].map(tool => ({ ...tool, canStop: false })); return { status: turn.observationLost || turn.supplementUnknown ? 'unknown' : turn.terminal ? tools.some(tool => tool.status === 'running') ? 'tools-active' : tools.some(tool=>tool.status==='unknown')?'unknown': turn.terminal === 'stopped' ? 'stopped' : 'idle' : turn.pending.size ? 'waiting' : 'running', executionRef: this.executionReference(turn.id,turn.input.contextRef.id), tools, requests: [...turn.pending.values()].map(value => value.request), ...(turn.observationLost ? { diagnostic: 'DSH 执行观察中断，正在核对原执行。' + (turn.observationDiagnostic ? ' 原因：' + turn.observationDiagnostic : '') } : turn.diagnostic ? { diagnostic: turn.diagnostic } : {}) };
  }
  async observe({ contextRef, executionRef,knownItems=[] }: { contextRef: ContextRef; executionRef?: ExecutionRef;knownItems?:readonly ExecutorItem[] }): Promise<ExecutorObservation> {
    this.reference(contextRef); const turn = this.turns.get(contextRef.id);
    if (turn && executionRef?.id === turn.id && (turn.observationLost || turn.terminal && [...turn.tools.values()].some(tool => tool.status !== 'completed'))) await this.restoreObservation(turn);
    if(turn&&executionRef?.id===turn.id)for(const item of knownItems)if(item.kind==='tool'&&item.executionId===turn.id&&item.status==='completed'&&turn.tools.get(item.id)?.status==='unknown')turn.tools.get(item.id)!.status='completed';
    if (turn && (!executionRef || turn.id === executionRef.id)) { if(turn.stopRequested&&!turn.terminal)await this.cancelSteering(turn).catch(()=>{turn.supplementUnknown=true;});return this.activeObservation(turn); }
    const cwd = this.reference(contextRef);
    await this.readHistory({ contextRef, cwd });
    const events = this.historyEvents.get(contextRef.id) ?? [];
    if(!executionRef)return {status:'unknown',tools:[],diagnostic:'dsh_execution_identity_required'};
    const observation=dshExecutionObservation(events,executionRef.id,knownItems);
    return {...observation,...(observation.executionRef?.id===executionRef.id?{executionRef}: {})};
  }
  private async hasBackgroundWork(contextId:string):Promise<boolean>{
    const abort=new AbortController();let stream:any;
    try{
      stream=this.client.remote.job.list({sessionId:contextId},abort.signal);
      const frame=await bounded(stream[Symbol.asyncIterator]().next(),2000,'dsh_jobs_observation_timeout');
      const value=(frame as any).value;
      if((frame as any).done||value?.type!=='rows'||!Array.isArray(value.jobs))throw new Error('dsh_jobs_observation_unconfirmed');
      return value.jobs.some((job:any)=>{
        if(job.owner!==undefined&&job.owner!==contextId)return false;
        if(!['running','stopping','completed','failed','killed'].includes(job.status))throw new Error('dsh_jobs_observation_unconfirmed');
        return ['running','stopping'].includes(job.status);
      });
    }finally{abort.abort();await bounded(Promise.resolve(stream?.dispose()),1000).catch(()=>{});}
  }
  async canRelease({contextRef,executionRef}:{contextRef:ContextRef;executionRef:ExecutionRef}):Promise<boolean|{executionState:'ended'|'unknown'}>{
    this.reference(contextRef);if(!this.host.control)return false;
    const turn=this.turns.get(contextRef.id),exited=this.host.child.exitCode!==null||this.host.child.signalCode!==null;
    if(turn&&turn.id!==executionRef.id||this.login||[...this.turns.values()].some(value=>value.pending.size||value.id!==executionRef.id&&!value.terminal))return false;
    if(!exited&&turn&&(turn.supplementAdmissions||turn.supplementInputs?.size||turn.supplementUnknown||turn.pendingEnd))return false;
    if(!exited){try{if(await this.hasBackgroundWork(contextRef.id))return false;}catch{return false;}}
    const observation=turn?this.activeObservation(turn):dshExecutionObservation(this.historyEvents.get(contextRef.id)??[],executionRef.id);
    const ended=Boolean(turn?.terminal)||['idle','stopped'].includes(observation.status);
    const executionState=['idle','stopped'].includes(observation.status)&&observation.tools.every(tool=>tool.status==='completed')?'ended':'unknown';
    return this.host.control.releaseExecution(executionRef,contextRef.id,this.bindingIdentity,{ended,executionState,channelClosed:this.disposed});
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
    turn.stopRequested=true;
    if (!turn.terminal) await this.cancelSteering(turn).catch(()=>{turn.supplementUnknown=true;});
    return this.activeObservation(turn);
  }
  async close(): Promise<void> {
    const controlExited=Boolean(this.host.child&&(this.host.child.exitCode!==null||this.host.child.signalCode!==null));
    this.disposed = true;
    for (const turn of this.turns.values()) if (turn.retryTimer) { clearTimeout(turn.retryTimer); turn.retryTimer = undefined; }
    await this.cancelLogin();
    await Promise.allSettled([...this.turns.values()].map(async turn => {
      if (!turn.terminal) turn.reject?.(new Error('agent_native_process_closed'));
      if (!turn.terminal&&!controlExited) await bounded(this.client.remote.session.cancel({ sessionId: turn.input.contextRef.id }), 1500).catch(() => {});
      for (const pending of turn.pending.values()) { pending.resolve?.('cancelled'); pending.reject?.(new Error('dsh_question_expired')); await pending.wait?.dispose(); }
      await turn.stream?.dispose(); await turn.pump;
    }));
    await this.host.close();
    if(this.modelBridge)await rm(this.modelBridge.addressFile,{force:true});
    if (this.forkBridge) {
      await rm(this.forkBridge.addressFile,{force:true});
      await rm(this.forkBridge.patch,{force:true});
    }
  }
}
