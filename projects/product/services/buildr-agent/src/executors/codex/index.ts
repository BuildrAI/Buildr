import { isCompatibleProgram, nativeProgramPolicy } from '../program-policy.ts';
import { join } from 'node:path';
import type { AgentExecutor, AgentRuntime, ContextRef, ExecutionRef, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorRequest, ExecutorSendInput, ExecutorTitleInput, LoginObservation, PermissionMode } from '../../contracts.ts';
import { NativeRpc, nativePreview, nativeBinding, bounded, findExecutable, inspectVersion, isolatedEnvironment, nativeCommand, nativeHome, opaqueReference, parseReference, privateDirectories, visibleText, type RpcMessage } from '../native-process.ts';
import { modelOptions } from '../model-options.ts';
import { generateCodexTitle } from './title.ts';
import { codexThreadPermissions, codexTurnPermissions } from './permissions.ts';

const capabilities = { permissionModes: ['default', 'full-access'] as PermissionMode[], text: true, images: true, maxImageBytes: 8 * 1024 * 1024, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 96 * 1024 };
interface ActiveTurn { contextId: string; id: string; input: ExecutorSendInput; tools: Map<string, { id: string; label: string; status: 'running' | 'completed' | 'unknown'; processId?: string }>; pending: Map<string, { nativeId: string | number; method: string; params: any }>; texts: Map<string, string>; terminal?: 'completed' | 'stopped' | 'failed'; done: () => void; reject: (error: Error) => void; accepted: boolean; buffered: RpcMessage[] }
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
  private readonly titleDirectory: string;
  private readonly auxiliary = new Set<string>();
  private constructor(bindingIdentity: string, rpc: NativeRpc, titleDirectory: string) { this.bindingIdentity = bindingIdentity; this.rpc = rpc; this.titleDirectory = titleDirectory; rpc.onMessage(message => this.message(message)); }
  static async open(options: ExecutorOpenOptions): Promise<CodexRuntime> {
    options.signal?.throwIfAborted();
    const { home, temporary } = nativeHome(options.configRoot);
    const config = join(options.configRoot, 'codex-home');
    await privateDirectories(options.configRoot, home, temporary, config);
    const env = isolatedEnvironment(options.environment, home, temporary, { CODEX_HOME: config });
    const executable = await findExecutable(options.executable, ['codex', 'codex.exe'], env);
    const version = await inspectVersion(executable, env, options.signal);
    if (!isCompatibleProgram('codex', version)) throw new Error(`codex_version_unsupported: requires ${nativeProgramPolicy('codex').compatibility}`);
    const binding = await nativeBinding('codex', executable, version, config, options.binding);
    const launch = nativeCommand(executable);
    const rpc = new NativeRpc(launch.command, [...launch.prefix, 'app-server', '--listen', 'stdio://', '-c', 'cli_auth_credentials_store="file"'], { cwd: options.configRoot, env });
    const runtime = new CodexRuntime(binding.identity, rpc, join(temporary, 'title-requests'));
    runtime.bindingData = binding.data;
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
    const result = await this.rpc.call('account/read', { refreshToken: false });
    return result.account ? { status: 'ready' as const, label: result.account.type === 'chatgpt' ? `ChatGPT${result.account.planType ? ' · ' + result.account.planType : ''}` : 'Codex', loginMethod: result.account.type === 'chatgpt' ? 'ChatGPT' : '原生配置' } : { status: 'not-authenticated' as const };
  }
  async models() {
    const result = []; let cursor: string | undefined;
    do {
      const page = await this.rpc.call('model/list', { limit: 100, ...(cursor ? { cursor } : {}) });
      result.push(...(page.data ?? []).filter((model: any) => !model.hidden && typeof model.id === 'string').map((model: any) => modelOptions({ id: model.id, label: model.displayName ?? model.id, ...(model.isDefault === true ? { isDefault: true } : {}) }, model.supportedReasoningEfforts?.map((effort: any) => ({ id: effort.reasoningEffort, label: effort.description ?? effort.reasoningEffort })), model.defaultReasoningEffort)));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && result.length < 1000);
    return result;
  }
  async beginLogin(update: (value: LoginObservation) => void): Promise<void> {
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
    const result = await this.rpc.call('thread/start', { cwd, ephemeral: false, ...codexThreadPermissions(permissionMode) });
    if (!result.thread?.id || result.thread.cwd !== cwd) throw new Error('codex_context_identity_mismatch');
    return this.context(result.thread.id, cwd);
  }
  async resumeContext({ contextRef, cwd, permissionMode }: { contextRef: ContextRef; cwd: string; permissionMode?: PermissionMode }): Promise<void> {
    this.reference(contextRef, cwd);
    const result = await this.rpc.call('thread/resume', { threadId: contextRef.id, cwd, ...(permissionMode === undefined ? {} : codexThreadPermissions(permissionMode)) });
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
    return await generateCodexTitle(this.rpc, input, this.titleDirectory, this.auxiliary);
  }
  async send(input: ExecutorSendInput): Promise<void> {
    this.reference(input.contextRef, input.cwd);
    if (this.turns.get(input.contextRef.id)?.terminal === undefined && this.turns.has(input.contextRef.id)) throw new Error('agent_native_turn_active');
    let done!: () => void; let reject!: (error: Error) => void;
    const ended = new Promise<void>((resolve, fail) => { done = resolve; reject = fail; }); ended.catch(() => {});
    const turn: ActiveTurn = { contextId: input.contextRef.id, id: '', input, tools: new Map(), pending: new Map(), texts: new Map(), done, reject, accepted: false, buffered: [] };
    this.turns.set(turn.contextId, turn);
    try {
      const response = await this.rpc.call('turn/start', { threadId: turn.contextId, input: [{ type: 'text', text: input.text }, ...input.images.map(image => ({ type: 'localImage', path: image.path }))], ...(input.model ? { model: input.model } : {}), effort: input.reasoningEffort ?? null, ...codexTurnPermissions(input.permissionMode, input.cwd) });
      if (!response.turn?.id) throw new Error('codex_turn_identity_missing');
      turn.id = response.turn.id;
      input.onEvent({ type: 'accepted', executionRef: { id: turn.id }, inputItemId: response.turn.items?.find((item: any) => item.type === 'userMessage')?.id });
      turn.accepted = true;
      for (const message of turn.buffered.splice(0)) this.turnMessage(turn, message);
      await ended;
    } catch (error) { if (!turn.accepted) { this.turns.delete(turn.contextId); } throw error; }
  }
  private message(message: RpcMessage): void {
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
    if (message.method === 'thread/name/updated') { if (typeof p.threadName === 'string') emit({ type: 'title', title: p.threadName }); return; }
    if (p.turnId && p.turnId !== turn.id || p.turn?.id && p.turn.id !== turn.id) return;
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
      for (const request of turn.pending.keys()) emit({ type: 'request-resolved', requestId: request }); turn.pending.clear();
      emit({ type: 'completed', status: turn.terminal, ...(turn.terminal === 'failed' ? { diagnostic: 'codex_turn_failed' } : {}) }); turn.done();
    }
  }
  private activeObservation(turn: ActiveTurn): ExecutorObservation {
    const tools = [...turn.tools.values()].map(({ processId, ...tool }) => ({ ...tool, canStop: Boolean(processId) && tool.status === 'running' }));
    return { status: turn.terminal ? tools.some(tool => tool.status === 'running') ? 'tools-active' : turn.terminal === 'stopped' ? 'stopped' : 'idle' : turn.pending.size ? 'waiting' : 'running', executionRef: { id: turn.id }, tools };
  }
  async observe({ contextRef, executionRef }: { contextRef: ContextRef; executionRef?: ExecutionRef }): Promise<ExecutorObservation> {
    this.reference(contextRef);
    const turn = this.turns.get(contextRef.id);
    if (turn && (!executionRef || executionRef.id === turn.id)) { if (turn.terminal) await this.refreshTerminals(turn); return this.activeObservation(turn); }
    const history = await this.rpc.call('thread/read', { threadId: contextRef.id, includeTurns: true });
    const exact = executionRef ? history.thread?.turns?.find((item: any) => item.id === executionRef.id) : history.thread?.turns?.at(-1);
    if (!exact) return { status: 'unknown', tools: [], diagnostic: 'codex_turn_not_observed' };
    return { status: exact.status === 'inProgress' ? 'unknown' : exact.status === 'interrupted' ? 'stopped' : 'idle', executionRef: { id: exact.id }, tools: (exact.items ?? []).filter((item: any) => item.type === 'commandExecution' && item.status === 'inProgress').map((item: any) => ({ id: item.id, label: String(item.command ?? '命令'), status: 'unknown' as const, canStop: false })) };
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
    if (!turn || turn.id !== executionRef.id) return { status: 'unknown', tools: [], diagnostic: 'codex_exact_live_turn_unavailable' };
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
  const final = status === 'completed' ? 'completed' as const : status === 'failed' ? 'failed' as const : 'running' as const;
  if (item.type === 'agentMessage') return [{ id: item.id, kind: 'message', role: 'assistant', text: String(item.text ?? ''), executionId, status: final }];
  if (item.type === 'userMessage') return [{ id: item.id, kind: 'message', role: 'user', text: visibleText(item.content), executionId, status: 'completed' }];
  if (item.type === 'commandExecution') return [{ id: item.id, kind: 'tool', role: 'system', text: String(item.command ?? '命令') + (item.aggregatedOutput ? '\n' + nativePreview(String(item.aggregatedOutput)) : ''), executionId, status: final }];
  if (item.type === 'fileChange') return [{ id: item.id, kind: 'tool', role: 'system', text: '修改文件\n' + (item.changes ?? []).map((change: any) => String(change.path ?? '')).join('\n'), executionId, status: final }];
  if (item.type === 'mcpToolCall') return [{ id: item.id, kind: 'tool', role: 'system', text: String(item.tool ?? '工具'), executionId, status: final }];
  return [];
}
function codexRequest(id: string, method: string, params: any): ExecutorRequest | undefined {
  if (method === 'item/tool/requestUserInput') return { id, kind: 'question', title: '需要补充信息', questions: (params.questions ?? []).map((question: any) => ({ id: question.id, label: String(question.question ?? question.header ?? ''), options: question.options?.map((option: any) => ({ id: option.label, label: option.label })) })) };
  if (method === 'item/permissions/requestApproval') return { id, kind: 'approval', title: '允许本轮所列权限？', description: String(params.reason ?? '') + '\n' + JSON.stringify(params.permissions ?? {}), options: [{ id: 'approve', label: '允许本轮所列权限' }, { id: 'deny', label: '拒绝' }] };
  if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') return { id, kind: 'approval', title: method === 'item/fileChange/requestApproval' ? '允许修改文件？' : '允许运行命令？', description: String(params.command ?? params.reason ?? ''), options: [{ id: 'approve', label: '允许本次' }, { id: 'deny', label: '拒绝' }] };
  return undefined;
}
