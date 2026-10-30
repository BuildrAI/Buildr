import { codexUnsettledTools } from './recovery.ts';
import { interactionPolicy, blocksExecution } from '../../domain/interaction-policy.ts';
import {createHash} from 'node:crypto';
import { errorDiagnostic, NativeObservationError } from '../../domain/error-diagnostic.ts';
import { isCompatibleProgram, nativeProgramPolicy } from '../program-policy.ts';
import { join, relative, sep, isAbsolute } from 'node:path';
import { lstat, readFile, writeFile, copyFile, realpath, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { AgentExecutor, AgentRuntime, ContextRef, ExecutionRef, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorRequest, ExecutorSendInput, ExecutorTitleInput, LoginObservation, PermissionMode } from '../../contracts.ts';
import { NativeRpc, nativePreview, nativeBinding, bounded, findExecutable, inspectVersion, isolatedEnvironment, nativeCommand, nativeHome, opaqueReference, parseReference, privateDirectories, visibleText, type RpcMessage } from '../native-process.ts';
import { modelOptions } from '../model-options.ts';
import { generateCodexTitle } from './title.ts';
import { codexThreadPermissions, codexTurnPermissions } from './permissions.ts';
import { ExecutorInputRejected, type ExecutorSupplementInput, type ExecutorInputReceipt } from '../../contracts.ts';
import { checkedGateway, consumerBinding, gatewayModel, gatewayEffort, type ExecutorGateway } from '../model-gateway.ts';
import type { ExecutorForkInput } from '../../contracts.ts';

const capabilities = { interaction: { policy: interactionPolicy.version, nonBlockingQuestions: true }, supplement: true, permissionModes: ['default', 'full-access'] as PermissionMode[], text: true, images: true, maxImageBytes: 8 * 1024 * 1024, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 96 * 1024 };
// Work-thread overrides also apply on resume; auxiliary title/summary threads stay tool-free.
const conversationInteraction = {
  config: { features: { default_mode_request_user_input: true } },
  developerInstructions: interactionPolicy.instructions + '\n必要提问使用 request_user_input。',
};
function codexEffort(value?: string): string | undefined {
  if (value === 'off') return 'none';
  return value && ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(value) ? value : undefined;
}
function codexGatewayCatalog(gateway: ExecutorGateway) {
  return { models: gateway.models.map((model, priority) => ({
    slug: model.id, display_name: model.label, description: 'Buildr model connection',
    visibility: 'list', supported_in_api: true, priority,
    base_instructions: 'You are a coding agent. Follow the user request and applicable project instructions. Use the supplied tools when needed.',
    shell_type: 'shell_command', apply_patch_tool_type: model.tools === true ? 'freeform' : null,
    supports_parallel_tool_calls: false, experimental_supported_tools: [], support_verbosity: false,
    prefer_websockets: false, supports_reasoning_summary_parameter: false, supports_reasoning_summaries: false,
    supports_reasoning_effort_updates: Boolean(model.reasoningEfforts?.length),
    default_reasoning_level: codexEffort(model.defaultReasoningEffort) ?? null,
    supported_reasoning_levels: (model.reasoningEfforts ?? []).filter(option => codexEffort(option.id)).map(option => ({ effort: codexEffort(option.id), description: option.label })),
    input_modalities: model.vision ? ['text', 'image'] : ['text'],
    ...(model.contextWindow ? { context_window: model.contextWindow } : {}),
    truncation_policy: { mode: 'tokens', limit: 10000 },
  })) };
}
interface ActiveTurn { contextId: string; id: string; input: ExecutorSendInput; tools: Map<string, { id: string; label: string; status: 'running' | 'completed' | 'unknown'; processId?: string }>; pending: Map<string, { nativeId: string | number; method: string; params: any }>; texts: Map<string, string>; terminal?: 'completed' | 'stopped' | 'failed'; diagnostic?: string; done: () => void; reject: (error: Error) => void; accepted: boolean; buffered: RpcMessage[] }
export function createCodexExecutor(): AgentExecutor {
  return { descriptor: { id: 'codex', label: 'Codex', capabilities }, async open(options) { return await CodexRuntime.open(options); } };
}
class CodexRuntime implements AgentRuntime {
  readonly capabilities = capabilities;
  private turns = new Map<string, ActiveTurn>();
  private contexts = new Map<string, string>();
  private login?: { id?: string; update: (value: LoginObservation) => void; done: () => void };
  readonly bindingIdentity: string;
  bindingData?: Record<string, unknown>;
  private rpc: NativeRpc;
  private interaction = conversationInteraction;
  get closed(): boolean { return this.rpc.closed; }
  private readonly titleDirectory: string;
  private readonly auxiliary = new Set<string>();
  private gateway?: ExecutorGateway;
  private modelConfig?: string;
  private constructor(bindingIdentity: string, rpc: NativeRpc, titleDirectory: string) { this.bindingIdentity = bindingIdentity; this.rpc = rpc; this.titleDirectory = titleDirectory; rpc.onMessage(message => this.message(message)); }
  static async open(options: ExecutorOpenOptions): Promise<CodexRuntime> {
    options.signal?.throwIfAborted();
    const gateway = checkedGateway(options.gateway);
    const { home, temporary } = nativeHome(options.configRoot);
    const config = join(options.configRoot, 'codex-home');
    await privateDirectories(options.configRoot, home, temporary, config);
    const env = isolatedEnvironment(options.environment, home, temporary, { CODEX_HOME: config, ...(gateway ? { BUILDR_MODEL_GATEWAY_KEY: gateway.apiKey, NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1' } : {}) });
    const executable = await findExecutable(options.executable, ['codex', 'codex.exe'], env);
    const version = await inspectVersion(executable, env, options.signal);
    if (!isCompatibleProgram('codex', version)) throw new Error(`codex_version_unsupported: requires ${nativeProgramPolicy('codex').compatibility}`);
    const binding = await consumerBinding('codex', executable, version, config, options);
    const launch = nativeCommand(executable);
    const overrides: string[] = [];
    if (gateway) {
      const model = gatewayModel(gateway);
      const catalog = join(config, 'buildr-model-catalog.json');
      await writeFile(catalog, JSON.stringify(codexGatewayCatalog(gateway)), { mode: 0o600 });
      const values = { web_search: 'disabled', model_provider: 'buildr-models', model: model.id, review_model: model.id, model_catalog_json: catalog, 'model_providers.buildr-models.name': 'Buildr', 'model_providers.buildr-models.base_url': gateway.baseUrl.replace(/\/$/, ''), 'model_providers.buildr-models.env_key': 'BUILDR_MODEL_GATEWAY_KEY', 'model_providers.buildr-models.wire_api': 'responses', 'model_providers.buildr-models.requires_openai_auth': false, 'model_providers.buildr-models.supports_websockets': false, ...(model.contextWindow ? { model_context_window: model.contextWindow } : {}) };
      for (const [key, value] of Object.entries(values)) overrides.push('-c', `${key}=${JSON.stringify(value)}`);
    }
    const rpc = new NativeRpc(launch.command, [...launch.prefix, 'app-server', '--listen', 'stdio://', '-c', 'cli_auth_credentials_store="file"', ...overrides], { cwd: options.configRoot, env });
    const runtime = new CodexRuntime(binding.identity, rpc, join(temporary, 'title-requests'));
    runtime.interaction = { ...conversationInteraction, developerInstructions: (options.interaction ?? interactionPolicy).instructions + '\n必要提问使用 request_user_input。' };
    runtime.bindingData = binding.data;
    runtime.gateway = gateway; runtime.modelConfig = config;
    let abortedClose: Promise<void> | undefined; const abort = () => { abortedClose ??= rpc.close(); };
    options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
    try {
      await rpc.call('initialize', { clientInfo: { name: 'buildr', title: 'Buildr', version: '1.0.0' }, capabilities: { experimentalApi: true } });
      rpc.write({ method: 'initialized', params: {} });
      options.signal?.throwIfAborted(); return runtime;
    } catch (error) { await (abortedClose ?? rpc.close()); throw error; }
    finally { options.signal?.removeEventListener('abort', abort); }
  }
  private reference(contextRef: ContextRef, cwd?: string): string {
    const saved = this.contexts.get(contextRef.id) ?? (typeof contextRef.data?.cwd === 'string' ? contextRef.data.cwd : undefined);
    if (!saved || cwd && saved !== cwd) throw new Error('agent_context_binding_mismatch');
    const { nativeSessionId } = parseReference(String(contextRef.data?.native ?? ''), 'codex', saved, this.bindingIdentity);
    if (nativeSessionId !== contextRef.id) throw new Error('agent_context_binding_mismatch');
    this.contexts.set(contextRef.id, saved); return saved;
  }
  private context(id: string, cwd: string): ContextRef { this.contexts.set(id, cwd); return { id, data: { cwd, native: opaqueReference('codex', id, cwd, this.bindingIdentity) } }; }
  async inspectAccount() {
    if (this.gateway) return { status: 'ready' as const, label: this.gateway.models[0].label, loginMethod: 'Buildr 模型连接' };
    const result = await this.rpc.call('account/read', { refreshToken: false });
    if (result.requiresOpenaiAuth === false) return { status: 'ready' as const, label: 'Codex', loginMethod: '自定义模型连接' };
    return result.account ? { status: 'ready' as const, label: result.account.type === 'chatgpt' ? `ChatGPT${result.account.planType ? ' · ' + result.account.planType : ''}` : 'Codex', loginMethod: result.account.type === 'chatgpt' ? 'ChatGPT' : '原生配置' } : { status: 'not-authenticated' as const };
  }
  async modelIdentity():Promise<string> {
    const file=join(this.modelConfig!,'auth.json'),info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw new Error('codex_credential_unsafe');
    const data=JSON.parse(await readFile(file,'utf8'));
    const id=data.tokens?.account_id; if(typeof id!=='string'||!id)throw new Error('codex_account_identity_missing');
    return 'codex:'+id;
  }
  async requestModel(path:string, init:RequestInit={},expectedIdentity?:string):Promise<Response> {
    if(this.gateway || !['/codex/models?client_version=0.163.0','/codex/responses','/wham/usage'].includes(path))throw new Error('codex_model_target_invalid');
    const auth=await this.rpc.call('getAuthStatus',{includeToken:true,refreshToken:true});
    if(typeof auth.authToken!=='string')return new Response(null,{status:401});
    const identity=await this.modelIdentity();
    if(expectedIdentity&&createHash('sha256').update(identity).digest('hex')!==expectedIdentity)throw new Error('model_identity_conflict');
    return fetch('https://chatgpt.com/backend-api'+path,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),authorization:'Bearer '+auth.authToken,'chatgpt-account-id':identity.slice(6),originator:'codex_cli_rs','user-agent':'codex_cli_rs/0.163.0'},redirect:'error'});
  }
  async models() {
    if (this.gateway) return structuredClone(this.gateway.models);
    const result = []; let cursor: string | undefined;
    do {
      const page = await this.rpc.call('model/list', { limit: 100, ...(cursor ? { cursor } : {}) });
      result.push(...(page.data ?? []).filter((model: any) => !model.hidden && typeof model.id === 'string').map((model: any) => modelOptions({ id: model.id, label: model.displayName ?? model.id, ...(model.isDefault === true ? { isDefault: true } : {}) }, model.supportedReasoningEfforts?.map((effort: any) => ({ id: effort.reasoningEffort, label: effort.description ?? effort.reasoningEffort })), model.defaultReasoningEffort)));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && result.length < 1000);
    return result;
  }
  async beginLogin(update: (value: LoginObservation) => void): Promise<void> {
    if (this.gateway) { update({ state: 'failed', diagnostic: 'agent_gateway_login_managed_by_model_account' }); return; }
    await this.cancelLogin();
    let done!: () => void; const ended = new Promise<void>(resolve => { done = resolve; });
    const login = { id: undefined as string | undefined, update, done }; this.login = login; update({ state: 'initializing' });
    try {
      const response = await this.rpc.call('account/login/start', { type: 'chatgpt' }); login.id = response.loginId;
      if (this.login !== login) { if (login.id) await this.rpc.call('account/login/cancel', { loginId: login.id }, 2000).catch(() => {}); return; }
      const url = new URL(response.authUrl);
      if (url.protocol !== 'https:' || !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com', 'login.openai.com'].includes(url.hostname)) throw new Error('codex_login_url_invalid');
      update({ state: 'waiting-browser', url: url.href });
      await bounded(ended, 15 * 60 * 1000, 'agent_login_expired');
    } catch (error) {
      if (this.login === login) {
        this.login = undefined; if (login.id) await this.rpc.call('account/login/cancel', { loginId: login.id }, 2000).catch(() => {});
        update({ state: error instanceof Error && error.message === 'agent_login_expired' ? 'expired' : 'failed', diagnostic: 'codex_login_failed' }); login.done();
      }
    }
  }
  async cancelLogin(): Promise<void> {
    const login = this.login; if (!login) return; this.login = undefined;
    if (login.id) await this.rpc.call('account/login/cancel', { loginId: login.id }, 2000).catch(() => {});
    login.update({ state: 'cancelled' }); login.done();
  }
  async createContext({ cwd, permissionMode }: { cwd: string; permissionMode?: PermissionMode }): Promise<ContextRef> {
    const result = await this.rpc.call('thread/start', { cwd, ephemeral: false, ...this.interaction, ...codexThreadPermissions(permissionMode) });
    if (!result.thread?.id || result.thread.cwd !== cwd) throw new Error('codex_context_identity_mismatch');
    return this.context(result.thread.id, cwd);
  }
  async forkContext(input: ExecutorForkInput): Promise<ContextRef> {
    const source = input.source;
    if (!(source instanceof CodexRuntime)) throw new Error('agent_context_binding_mismatch');
    source.reference(input.contextRef, input.cwd);
    const observed = await source.rpc.call('thread/read', { threadId: input.contextRef.id, includeTurns: true });
    const turns = observed.thread?.turns ?? [];
    const selected = turns.find((turn: any) => turn.id === input.executionRef.id);
    if (observed.thread?.id !== input.contextRef.id || observed.thread.cwd !== input.cwd || !selected || selected.status === 'inProgress') throw new Error('agent_fork_boundary_unavailable');
    // A paginated Codex store cannot resolve a foreign CODEX_HOME's thread from
    // path alone. Copy the native-owned opaque rollout into the destination's
    // private store first; Codex, not Buildr, interprets and slices that history.
    // Never link or mutate the original; the imported snapshot is not used for work.
    let importPath: string | undefined;
    if (source !== this) {
      if (typeof observed.thread.path !== 'string' || !source.modelConfig || !this.modelConfig) throw new Error('agent_fork_unavailable');
      const filename = await realpath(observed.thread.path), root = await realpath(source.modelConfig);
      const local = relative(root, filename);
      if (!local || isAbsolute(local) || local.startsWith('..' + sep) || !['sessions','archived_sessions'].includes(local.split(sep)[0]!)) throw new Error('agent_context_binding_mismatch');
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('agent_context_binding_mismatch');
      const parts = local.split(sep).slice(1);
      let directory = join(this.modelConfig, 'sessions');
      await privateDirectories(directory);
      for (const part of parts.slice(0,-1)) { directory = join(directory, part); await privateDirectories(directory); }
      importPath = join(directory, parts.at(-1)!);
      await copyFile(filename, importPath, constants.COPYFILE_EXCL);
      await chmod(importPath, 0o600);
    }
    const forked = await this.rpc.call('thread/fork', {
      threadId: input.contextRef.id, ...(importPath ? { path: importPath } : {}),
      lastTurnId: input.executionRef.id, cwd: input.cwd, ephemeral: false, deferGoalContinuation: true, ...this.interaction,
      ...(this.gateway ? { model: gatewayModel(this.gateway).id, modelProvider: 'buildr-models' } : {}),
    });
    if (!forked.thread?.id || forked.thread.id === input.contextRef.id || forked.thread.cwd !== input.cwd) throw new Error('agent_fork_identity_invalid');
    const ref = this.context(forked.thread.id, input.cwd);
    input.onCreated(ref);
    // Older servers can ignore unknown fields. Never accept a whole-history fork.
    const result = await this.rpc.call('thread/read', { threadId: ref.id, includeTurns: true });
    if (result.thread?.turns?.at(-1)?.id !== input.executionRef.id) throw new Error('agent_fork_boundary_unavailable');
    return ref;
  }
  async resumeContext({ contextRef, cwd, permissionMode }: { contextRef: ContextRef; cwd: string; permissionMode?: PermissionMode }): Promise<void> {
    this.reference(contextRef, cwd);
    const result = await this.rpc.call('thread/resume', { threadId: contextRef.id, cwd, ...this.interaction, ...(permissionMode === undefined ? {} : codexThreadPermissions(permissionMode)) });
    if (result.thread?.id !== contextRef.id || result.thread.cwd !== cwd) throw new Error('codex_context_identity_mismatch');
  }
  async readHistory({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<ExecutorItem[]> {
    this.reference(contextRef, cwd);
    const result = await this.rpc.call('thread/read', { threadId: contextRef.id, includeTurns: true });
    if (result.thread?.id !== contextRef.id || result.thread.cwd !== cwd) throw new Error('codex_context_identity_mismatch');
    return (result.thread.turns ?? []).flatMap((turn: any) => (turn.items ?? []).flatMap((item: any) => codexItem(item, turn.id, turn.status)));
  }
  async readTitle({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<string | undefined> {
    this.reference(contextRef, cwd);
    const result = await this.rpc.call('thread/read', { threadId: contextRef.id, includeTurns: false });
    if (result.thread?.id !== contextRef.id || result.thread.cwd !== cwd) throw new Error('codex_context_identity_mismatch');
    return typeof result.thread.name === 'string' ? result.thread.name : undefined;
  }
  async generateTitle(input: ExecutorTitleInput): Promise<string | undefined> {
    this.reference(input.contextRef, input.cwd);
    if (this.gateway) input = { ...input, model: gatewayModel(this.gateway).id };
    return await generateCodexTitle(this.rpc, input, this.titleDirectory, this.auxiliary);
  }
  async summarizeHandoff(input:ExecutorTitleInput):Promise<string|undefined>{
    this.reference(input.contextRef,input.cwd);
    if(this.gateway)input={...input,model:gatewayModel(this.gateway).id};
    return generateCodexTitle(this.rpc,input,this.titleDirectory,this.auxiliary,true);
  }
  async send(input: ExecutorSendInput): Promise<void> {
    this.reference(input.contextRef, input.cwd);
    if (this.gateway) {
      const effort = gatewayEffort(this.gateway, input.model, input.reasoningEffort);
      if (input.reasoningEffort && !codexEffort(effort)) throw new Error('agent_reasoning_unavailable');
      input = { ...input, model: gatewayModel(this.gateway, input.model).id, reasoningEffort: codexEffort(effort) };
    }
    if (this.turns.get(input.contextRef.id)?.terminal === undefined && this.turns.has(input.contextRef.id)) throw new Error('agent_native_turn_active');
    let done!: () => void; let reject!: (error: Error) => void;
    const ended = new Promise<void>((resolve, fail) => { done = resolve; reject = fail; }); ended.catch(() => {});
    const turn: ActiveTurn = { contextId: input.contextRef.id, id: '', input, tools: new Map(), pending: new Map(), texts: new Map(), done, reject, accepted: false, buffered: [] };
    this.turns.set(turn.contextId, turn);
    try {
      const response = await this.rpc.call('turn/start', { threadId: turn.contextId, clientUserMessageId: input.clientRequestId, input: [{ type: 'text', text: input.text }, ...input.images.map(image => ({ type: 'localImage', path: image.path }))], ...(input.model ? { model: input.model } : {}), effort: input.reasoningEffort ?? null, ...codexTurnPermissions(input.permissionMode, input.cwd) });
      if (!response.turn?.id) throw new Error('codex_turn_identity_missing');
      turn.id = response.turn.id;
      input.onEvent({ type: 'accepted', executionRef: this.rpc.executionRef(turn.id, turn.contextId, this.bindingIdentity), inputItemId: response.turn.items?.find((item: any) => item.type === 'userMessage')?.id });
      turn.accepted = true;
      for (const message of turn.buffered.splice(0)) this.turnMessage(turn, message);
      await ended;
    } catch (error) { if (!turn.accepted) { this.turns.delete(turn.contextId); } throw error; }
  }
  async supplement(input: ExecutorSupplementInput): Promise<ExecutorInputReceipt> {
    this.reference(input.contextRef, input.cwd);
    const turn = this.turns.get(input.contextRef.id);
    if (!turn?.accepted || turn.terminal || turn.id !== input.executionRef.id) throw new ExecutorInputRejected('agent_supplement_stale');
    const response = await this.rpc.call('turn/steer', { threadId: turn.contextId, expectedTurnId: turn.id, clientUserMessageId: input.clientRequestId, input: [{ type: 'text', text: input.text }, ...input.images.map(image => ({ type: 'localImage', path: image.path }))] });
    if (response.turnId !== turn.id) throw new Error('codex_steer_identity_mismatch');
    return { executionRef: { id: turn.id }, inputItemId: input.clientRequestId };
  }
  private message(message: RpcMessage): void {
    if (message.method === 'buildr/eventConsumerFailed') {
      for (const turn of this.turns.values()) if (!turn.terminal && (!message.params?.threadId || turn.contextId === message.params.threadId)) turn.reject(new NativeObservationError('codex_event_observation_lost', message.params?.diagnostic));
      return;
    }
    if (message.method === 'buildr/transportClosed') { for (const turn of this.turns.values()) if (!turn.terminal) turn.reject(new Error('codex_execution_observation_lost')); return; }
    if (message.method === 'account/login/completed') {
      const login = this.login;
      if (login && message.params?.loginId === login.id) {
        this.login = undefined;
        if (!message.params.success) { login.update({ state: 'failed', diagnostic: 'codex_login_failed' }); login.done(); }
        else { login.update({ state: 'checking' }); void this.inspectAccount().then(account => login.update({ state: account.status === 'ready' ? 'completed' : 'failed' })).catch(() => login.update({ state: 'failed', diagnostic: 'codex_account_unavailable' })).finally(login.done); }
      }
      return;
    }
    const contextId = message.params?.threadId;
    if (this.auxiliary.has(contextId)) return;
    const turn = this.turns.get(contextId);
    if (turn) { if (!turn.accepted) turn.buffered.push(message); else this.turnMessage(turn, message); }
    else if (message.id !== undefined && message.method) this.rpc.write({ id: message.id, error: { code: -32601, message: 'Unsupported or inactive Buildr request' } });
  }
  private turnMessage(turn: ActiveTurn, message: RpcMessage): void {
    const p = message.params ?? {}; const emit = turn.input.onEvent;
    if(message.method==='thread/tokenUsage/updated'){const usage=p.tokenUsage;const used=usage?.last?.totalTokens;const window=usage?.modelContextWindow;if(Number.isSafeInteger(used)&&used>=0)emit({type:'context-usage',usedTokens:used,...(Number.isSafeInteger(window)&&window>0?{windowTokens:window}:{})});return;}
    if (message.method === 'thread/name/updated') { if (typeof p.threadName === 'string') emit({ type: 'title', title: p.threadName }); return; }
    if (p.turnId && p.turnId !== turn.id || p.turn?.id && p.turn.id !== turn.id) return;
    if (message.method === 'serverRequest/resolved') {
      if ((typeof p.requestId === 'string' || typeof p.requestId === 'number') && turn.pending.delete(String(p.requestId))) {
        emit({ type: 'request-resolved', requestId: String(p.requestId) });
        emit({ type: 'observation', observation: this.activeObservation(turn) });
      }
      return;
    }
    if (message.method === 'error' && !p.willRetry) turn.diagnostic = errorDiagnostic(p.error?.message, this.gateway ? [this.gateway.apiKey] : []);
    if (message.id !== undefined && message.method) {
      const request = codexRequest(String(message.id), message.method, p);
      if (!request) { this.rpc.write({ id: message.id, error: { code: -32601, message: 'Unsupported Buildr request' } }); return; }
      turn.pending.set(request.id, { nativeId: message.id, method: message.method, params: p }); emit({ type: 'request', request }); return;
    }
    if (message.method === 'item/agentMessage/delta') {
      const text = (turn.texts.get(p.itemId) ?? '') + String(p.delta ?? ''); turn.texts.set(p.itemId, text);
      emit({ type: 'item', item: { id: p.itemId, kind: 'message', role: 'assistant', text, executionId: turn.id, status: 'running' } });
    }
    if (message.method === 'item/started' || message.method === 'item/completed') {
      const item = p.item;
      if (item?.type === 'commandExecution') turn.tools.set(item.id, { id: item.id, label: String(item.command ?? '命令'), status: message.method === 'item/completed' ? 'completed' : 'running', processId: item.processId });
      else if (item?.type === 'fileChange' || item?.type === 'mcpToolCall') turn.tools.set(item.id, { id: item.id, label: item.type === 'fileChange' ? '修改文件' : String(item.tool ?? '工具'), status: message.method === 'item/completed' ? 'completed' : 'running' });
      for (const safe of codexItem(item, turn.id, message.method === 'item/completed' ? 'completed' : 'inProgress')) emit({ type: 'item', item: safe });
      emit({ type: 'observation', observation: this.activeObservation(turn) });
    }
    if (message.method === 'turn/completed') {
      turn.terminal = p.turn?.status === 'completed' ? 'completed' : p.turn?.status === 'interrupted' ? 'stopped' : 'failed';
      if (turn.terminal === 'failed') {
        const message = errorDiagnostic(p.turn?.error?.message, this.gateway ? [this.gateway.apiKey] : []) ?? turn.diagnostic;
        turn.diagnostic = message ? `Codex · ${turn.tools.size ? '工具调用后' : '本轮执行'}：${message}` : 'codex_turn_failed';
      } else turn.diagnostic = undefined;
      try {
        for (const request of turn.pending.keys()) emit({ type: 'request-resolved', requestId: request }); turn.pending.clear();
        emit({ type: 'completed', status: turn.terminal, ...(turn.diagnostic ? { diagnostic: turn.diagnostic } : {}) });
        // Recovered observers can outlive send's rejected wait.
        emit({ type: 'observation', observation: this.activeObservation(turn) });
      } finally { turn.done(); } // A local terminal projection failure cannot strand send.
    }
  }
  private activeObservation(turn: ActiveTurn): ExecutorObservation {
    const tools = [...turn.tools.values()].map(({ processId, ...tool }) => ({ ...tool, canStop: Boolean(processId) && tool.status === 'running' }));
    const requests = [...turn.pending].flatMap(([id, pending]) => codexRequest(id, pending.method, pending.params) ?? []);
    return { status: turn.terminal ? tools.some(tool => tool.status === 'running') ? 'tools-active' : turn.terminal === 'stopped' ? 'stopped' : 'idle' : requests.some(blocksExecution) ? 'waiting' : 'running', executionRef: this.rpc.executionRef(turn.id, turn.contextId, this.bindingIdentity, [...turn.tools.values()].some(tool => Boolean(tool.processId) && tool.status !== 'completed')), tools, requests, ...(turn.terminal === 'failed' && turn.diagnostic ? { diagnostic: turn.diagnostic } : {}) };
  }
  async observe({ contextRef, executionRef, knownItems }: { contextRef: ContextRef; executionRef?: ExecutionRef; knownItems?: readonly ExecutorItem[] }): Promise<ExecutorObservation> {
    this.reference(contextRef);
    const turn = this.turns.get(contextRef.id);
    if (turn && (!executionRef || executionRef.id === turn.id)) { if (turn.terminal) await this.refreshTerminals(turn); return this.activeObservation(turn); }
    const history = await this.rpc.call('thread/read', { threadId: contextRef.id, includeTurns: true });
    const exact = executionRef ? history.thread?.turns?.find((item: any) => item.id === executionRef.id) : history.thread?.turns?.at(-1);
    if (!exact) return { status: 'unknown', tools: [], diagnostic: 'codex_turn_not_observed' };
    let unsettled: Awaited<ReturnType<typeof codexUnsettledTools>> = [];
    if (exact.status === 'interrupted') {
      try { unsettled = await codexUnsettledTools(history.thread.path, this.modelConfig!, contextRef.id, exact.id);
        const received = new Set((knownItems ?? []).filter(item => item.kind === 'tool' && item.executionId === exact.id && ['completed', 'failed'].includes(item.status ?? '') && !/Process running with session ID/.test(item.text)).map(item => item.id));
        for (const item of exact.items ?? []) {
          if (['commandExecution', 'fileChange', 'mcpToolCall'].includes(item.type) && ['completed', 'failed', 'declined'].includes(item.status)) received.add(item.id);
        }
        unsettled = unsettled.filter(tool => !received.has(tool.id)); }
      catch { return { status: 'unknown', executionRef: { id: exact.id }, tools: [], diagnostic: 'codex_recovery_history_unconfirmed' }; }
    }
    return { status: exact.status === 'inProgress' ? 'unknown' : exact.status === 'interrupted' ? 'stopped' : 'idle', executionRef: executionRef ?? { id: exact.id }, tools: [...new Map([...unsettled, ...(exact.items ?? []).filter((item: any) => ['commandExecution', 'fileChange', 'mcpToolCall'].includes(item.type) && !['completed', 'failed', 'declined'].includes(item.status)).map((item: any) => ({ id: item.id, label: String(item.command ?? '命令'), status: 'unknown' as const, canStop: false }))].map(tool => [tool.id, tool])).values()] };
  }
  async canRelease({contextRef,executionRef}:{contextRef:ContextRef;executionRef:ExecutionRef}):Promise<boolean|{executionState:'ended'|'unknown'}>{
    this.reference(contextRef);
    const turn=this.turns.get(contextRef.id);
    if(turn&&turn.id!==executionRef.id||this.auxiliary.size||this.login)return false;
    const exited=this.rpc.child.exitCode!==null||this.rpc.child.signalCode!==null;
    if(!exited&&[...this.turns.values()].some(value=>value.pending.size||!value.terminal&&value.id!==executionRef.id))return false;
    if(turn?.pending.size)return false;
    if(turn?.terminal&&!this.rpc.closed)await this.refreshTerminals(turn);
    // A PTY handle cannot retain this backend after its control process has gone.
    // The command may continue independently: preserve unknown execution/results.
    const ref=turn&&!exited?this.rpc.executionRef(turn.id,turn.contextId,this.bindingIdentity,[...turn.tools.values()].some(tool=>Boolean(tool.processId)&&tool.status!=='completed')):{...executionRef,data:executionRef.data?{...executionRef.data,backgroundWork:false}:undefined};
    return this.rpc.control.releaseExecution(ref,contextRef.id,this.bindingIdentity,{ended:Boolean(turn?.terminal),executionState:turn?.terminal&&[...turn.tools.values()].every(tool=>tool.status==='completed')?'ended':'unknown',channelClosed:this.rpc.closed});
  }
  async reply({ contextRef, executionRef, requestId, answer }: { contextRef: ContextRef; executionRef: ExecutionRef; requestId: string; answer: unknown }): Promise<void> {
    this.reference(contextRef); const turn = this.turns.get(contextRef.id); const pending = turn?.pending.get(requestId);
    if (!turn || turn.id !== executionRef.id || !pending || turn.terminal) throw new Error('agent_request_stale');
    let result: any;
    if (pending.method === 'item/tool/requestUserInput') {
      if (!answer || typeof answer !== 'object') throw new Error('agent_question_answer_invalid');
      const provided = answer as Record<string, unknown>; const answers: Record<string, { answers: string[] }> = {};
      for (const question of pending.params.questions ?? []) {
        const value = provided[question.id]; const selected = Array.isArray(value) ? value : typeof value === 'string' ? [value] : undefined;
        if (!selected?.length || selected.some(item => typeof item !== 'string')) throw new Error('agent_question_answer_invalid');
        answers[question.id] = { answers: selected as string[] };
      }
      result = { answers };
    } else {
      const approved = answer === 'approve' || answer === 'accept'; const denied = answer === 'deny' || answer === 'decline';
      if (!approved && !denied) throw new Error('agent_approval_answer_invalid');
      if (pending.method === 'item/permissions/requestApproval') {
        const requested = pending.params.permissions ?? {};
        result = { permissions: approved ? { ...(requested.network ? { network: requested.network } : {}), ...(requested.fileSystem ? { fileSystem: requested.fileSystem } : {}) } : {}, scope: 'turn' };
      } else result = { decision: approved ? 'accept' : 'decline' };
    }
    this.rpc.write({ id: pending.nativeId, result }); turn.pending.delete(requestId); turn.input.onEvent({ type: 'request-resolved', requestId });
  }
  async stop({ contextRef, executionRef, toolId }: { contextRef: ContextRef; executionRef: ExecutionRef; toolId?: string }): Promise<ExecutorObservation> {
    this.reference(contextRef); const turn = this.turns.get(contextRef.id);
    if (!turn || turn.id !== executionRef.id) {
      if (toolId) return { status: 'unknown', tools: [], diagnostic: 'codex_exact_live_turn_unavailable' };
      return this.observe({ contextRef, executionRef });
    }
    if (!turn.terminal && !toolId) await this.rpc.call('turn/interrupt', { threadId: contextRef.id, turnId: turn.id }, 5000);
    await this.refreshTerminals(turn);
    const selected = [...turn.tools.values()].filter(tool => tool.status === 'running' && (!toolId || tool.id === toolId));
    if (toolId && !selected.some(tool => tool.processId)) throw new Error('codex_exact_tool_stop_unavailable');
    for (const tool of selected) {
      if (!tool.processId) continue;
      try { await this.rpc.call('thread/backgroundTerminals/terminate', { threadId: contextRef.id, processId: tool.processId }, 4000); }
      catch { tool.status = 'unknown'; }
    }
    return await this.observe({ contextRef, executionRef });
  }
  private async refreshTerminals(turn: ActiveTurn): Promise<void> {
    const ownCommands = [...turn.tools.values()].filter(tool => tool.processId);
    if (!ownCommands.length) return;
    try {
      const native = await this.rpc.call('thread/backgroundTerminals/list', { threadId: turn.contextId, limit: 100 }, 4000);
      if (!Array.isArray(native.data) || native.nextCursor) { for (const tool of ownCommands) tool.status = 'unknown'; return; }
      for (const tool of ownCommands) {
        const live = native.data.some((terminal: any) => terminal.itemId === tool.id && terminal.processId === tool.processId);
        tool.status = live ? 'running' : 'completed';
      }
    } catch { for (const tool of ownCommands) tool.status = 'unknown'; }
  }
  async close(): Promise<void> {
    await this.cancelLogin();
    const active = [...this.turns.values()].filter(turn => !turn.terminal || [...turn.tools.values()].some(tool => tool.status === 'running'));
    await bounded(Promise.allSettled(active.map(turn => this.stop({ contextRef: turn.input.contextRef, executionRef: { id: turn.id } }))), 2500).catch(() => {});
    for (const turn of active) if (!turn.terminal) turn.reject(new Error('agent_native_process_closed'));
    await this.rpc.close();
  }
}
function codexItem(item: any, executionId: string, status: string): ExecutorItem[] {
  if (!item?.id) return [];
  // A stopped turn does not undo tools which already completed. Conversely,
  // an unfinished historical item is uncertain, not a live execution.
  const final: ExecutorItem['status'] = item.status === 'completed' ? 'completed' : item.status === 'failed' || item.status === 'declined' ? 'failed' : item.status === 'inProgress' ? status === 'inProgress' ? 'running' : undefined : status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status === 'interrupted' ? undefined : 'running';
  if (item.type === 'agentMessage') return [{ id: item.id, kind: 'message', role: 'assistant', text: String(item.text ?? ''), executionId, status: final }];
  if (item.type === 'userMessage') return [{ id: item.id, ...(typeof item.clientId === 'string' && item.clientId ? { clientRequestId: item.clientId } : {}), kind: 'message', role: 'user', text: visibleText(item.content), executionId, status: 'completed' }];
  if (item.type === 'commandExecution') return [{ id: item.id, kind: 'tool', role: 'system', name: 'command', input: String(item.command ?? ''), text: String(item.command ?? '命令') + (item.aggregatedOutput ? '\n' + nativePreview(String(item.aggregatedOutput)) : ''), executionId, status: final }];
  if (item.type === 'imageView') return [{ id: item.id, kind: 'tool', role: 'system', name: 'view-image', text: '查看图片\n' + String(item.path ?? ''), executionId, status: 'completed' }];
  if (item.type === 'fileChange') return [{ id: item.id, kind: 'tool', role: 'system', name: 'file-change', text: '修改文件\n' + (item.changes ?? []).map((change: any) => String(change.path ?? '')).join('\n'), executionId, status: final }];
  if (item.type === 'mcpToolCall') return [{ id: item.id, kind: 'tool', role: 'system', name: 'mcp-tool', input: item.arguments === undefined ? undefined : nativePreview(JSON.stringify(item.arguments)), text: String(item.tool ?? '工具'), executionId, status: final }];
  return [];
}
function codexRequest(id: string, method: string, params: any): ExecutorRequest | undefined {
  if (method === 'item/tool/requestUserInput') return { id, kind: 'question', blocking: params.isBlocking !== false, title: '需要你的回复', questions: (params.questions ?? []).map((question: any) => ({ id: question.id, label: String(question.question ?? question.header ?? ''), allowOther: Boolean(question.isOther), options: question.options?.map((option: any) => ({ id: option.label, label: option.label, ...(typeof option.description === 'string' ? { description: option.description } : {}) })) })) };
  if (method === 'item/permissions/requestApproval') return { id, kind: 'approval', title: '允许本轮所列权限？', description: String(params.reason ?? '') + '\n' + JSON.stringify(params.permissions ?? {}), options: [{ id: 'approve', label: '允许本轮所列权限' }, { id: 'deny', label: '拒绝' }] };
  if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') return { id, kind: 'approval', title: method === 'item/fileChange/requestApproval' ? '允许修改文件？' : '允许运行命令？', description: String(params.command ?? params.reason ?? ''), options: [{ id: 'approve', label: '允许本次' }, { id: 'deny', label: '拒绝' }] };
  return undefined;
}
