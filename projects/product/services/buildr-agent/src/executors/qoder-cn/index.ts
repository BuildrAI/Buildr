import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readQoderIdentity, requestQoderModel, inspectQoderLogin } from '../../model-access/providers/qoder.ts';
import { AcpClient, type AcpServerRequest } from '../qoder/acp.ts';
import { qoderContent } from '../qoder/content.ts';
import { qoderProduct } from '../qoder/product.ts';
import { qoderStorage } from '../qoder/storage.ts';
import { interactionPolicy } from '../../domain/interaction-policy.ts';
import { instructionParticipation } from '../../domain/participation.ts';
import { isCompatibleProgram, nativeProgramPolicy } from '../program-policy.ts';
import { accountEnvironment, findExecutable, inspectVersion, nativeCommand, nativeHome, opaqueReference, parseReference, privateDirectories, bounded, closeOwnedProcess } from '../native-process.ts';
import { consumerBinding } from '../model-gateway.ts';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AccountObservation, AgentExecutor, AgentRuntime, ContextRef, ExecutorEvent, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorRequest, ExecutorSendInput, LoginObservation, PermissionMode } from '../../contracts.ts';

const product = qoderProduct('qoder-cn');
const capabilities = { interaction: { policy: interactionPolicy.version, nonBlockingQuestions: false }, supplement: false, permissionModes: ['default', 'full-access'] as PermissionMode[], text: true, images: true, maxImageBytes: 8 * 1024 * 1024, approval: true, questions: false, stop: true, resume: false, maxInputBytes: 96 * 1024 };

interface PendingApproval {
  request: ExecutorRequest;
  options: Array<Record<string, unknown>>;
  settle(value: unknown): void;
}
interface SelectOption { id?: string; currentValue?: string; options?: Array<{ value: string; name?: string }> }
function selectOptions(value: unknown): Map<string, SelectOption> {
  const map = new Map<string, SelectOption>();
  for (const option of Array.isArray(value) ? value as SelectOption[] : []) if (option && typeof option.id === 'string' && Array.isArray(option.options)) map.set(option.id, option);
  return map;
}
interface TurnState {
  executionId: string;
  onEvent: (event: ExecutorEvent) => void;
  items: Map<string, ExecutorItem>;
  tools: Map<string, { id: string; label: string; status: 'running' | 'completed' | 'unknown' }>;
  approvals: Map<string, PendingApproval>;
  status: ExecutorObservation['status'];
  diagnostic?: string;
}

/** Qoder CN ships no importable Agent SDK; the official ACP server is its programmable surface. */
class QoderCnRuntime implements AgentRuntime {
  readonly capabilities = capabilities;
  readonly bindingIdentity: string;
  bindingData?: Record<string, unknown>;
  readonly participationInstruction?: import('../../participation-contracts.ts').ParticipationMatch;
  private closedFlag = false;
  private readonly config: string;
  private readonly environments: NodeJS.ProcessEnv;
  private executable!: string;
  private client?: AcpClient;
  private opening?: Promise<AcpClient>;
  private sessionId?: string;
  private sessionContext?: string;
  private configOptions = new Map<string, SelectOption>();
  private turn?: TurnState;
  private readonly contexts = new Map<string, string>();
  private login?: { child: ChildProcessWithoutNullStreams; cancelled: boolean; update: (value: LoginObservation) => void };

  private constructor(bindingIdentity: string, config: string, environments: NodeJS.ProcessEnv) {
    this.bindingIdentity = bindingIdentity; this.config = config; this.environments = environments;
    this.participationInstruction = instructionParticipation('interaction-policy', interactionPolicy.instructions);
  }

  get closed(): boolean { return this.closedFlag || this.client?.transportClosed === true; }

  static async open(options: ExecutorOpenOptions): Promise<QoderCnRuntime> {
    options.signal?.throwIfAborted();
    const { home, temporary } = nativeHome(options.configRoot);
    const config = join(options.nativeAccountConfigRoot ?? options.configRoot, product.configDirectory);
    const env = accountEnvironment(options.environment, home, temporary, { [product.configEnvironment]: config }, options.cacheRoot);
    await privateDirectories(options.configRoot, config, ...(env.HOME === home ? [home] : []), ...(env.TMPDIR === temporary ? [temporary] : []));
    const executable = await findExecutable(options.executable, product.executableNames, env);
    const version = await inspectVersion(executable, env, options.signal);
    if (!isCompatibleProgram('qoder-cn', version)) throw new Error(`qoder_cn_version_unsupported: requires ${nativeProgramPolicy('qoder-cn').compatibility}`);
    const binding = await consumerBinding('qoder-cn', executable, version, config, options);
    const runtime = new QoderCnRuntime(binding.identity, config, env);
    runtime.executable = executable;
    return runtime;
  }

  private async transport(): Promise<AcpClient> {
    this.closedFlag && (() => { throw new Error('qoder_cn_closed'); })();
    if (this.client && !this.client.transportClosed) return this.client;
    if (this.opening) return await this.opening;
    this.opening = (async () => {
      const client = AcpClient.open({
        executable: this.executable, args: ['--acp'], cwd: this.config, environment: this.environments,
        onNotification: (method, params) => this.notification(method, params),
        onServerRequest: request => this.serverRequest(request),
        onExit: () => this.transportLost(),
      });
      try {
        await client.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } } }, 30_000);
        return client;
      } catch (error) { await client.close(); throw error; }
    })().finally(() => { this.opening = undefined; });
    this.client = await this.opening;
    return this.client;
  }

  private transportLost(): void {
    this.sessionId = undefined; this.sessionContext = undefined;
    const turn = this.turn; if (!turn) return;
    turn.status = 'unknown';
    turn.diagnostic = 'Qoder CN 连接已中断，本轮执行结果未知；请重新检查后再继续。';
    for (const approval of turn.approvals.values()) { try { turn.onEvent({ type: 'request-resolved', requestId: approval.request.id }); } catch { /* keep transport closed */ } }
    turn.approvals.clear();
    try { turn.onEvent({ type: 'observation', observation: this.observation() }); } catch { /* original transport stays closed */ }
  }

  private notification(method: string, params: Record<string, unknown>): void {
    if (method !== 'session/update') return;
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : typeof params.session_id === 'string' ? params.session_id : undefined;
    if (!sessionId || this.sessionId && sessionId !== this.sessionId) return;
    const update = params.update as Record<string, unknown> | undefined; if (!update) return;
    const turn = this.turn; if (!turn) return;
    const kind = String(update.sessionUpdate ?? update.session_update ?? '');
    if (kind === 'agent_message_chunk' || kind === 'user_message_chunk' || kind === 'agent_thought_chunk') {
      const text = textOf(update.content); if (!text) return;
      const id = kind === 'agent_thought_chunk' ? `thinking:${turn.executionId}` : kind === 'agent_message_chunk' ? `message:${turn.executionId}` : `user:${turn.executionId}`;
      const prior = turn.items.get(id);
      const item: ExecutorItem = {
        ...(prior ?? {}), id, role: kind === 'user_message_chunk' ? 'user' : 'assistant',
        kind: kind === 'agent_thought_chunk' ? 'thinking' : 'message', text: (prior?.text ?? '') + text,
        ...(kind === 'agent_thought_chunk' ? { thinking: true } : {}), executionId: turn.executionId, status: 'running',
      };
      turn.items.set(id, item); turn.onEvent({ type: 'item', item });
      return;
    }
    if (kind === 'tool_call' || kind === 'tool_call_update') {
      const toolCall = update.toolCall && typeof update.toolCall === 'object' ? update.toolCall as Record<string, unknown> : update;
      const id = typeof toolCall.toolCallId === 'string' ? toolCall.toolCallId : typeof toolCall.tool_call_id === 'string' ? toolCall.tool_call_id : undefined;
      if (!id) return;
      const label = typeof toolCall.title === 'string' && toolCall.title ? toolCall.title : typeof toolCall.kind === 'string' ? toolCall.kind : '工具';
      const state = String(toolCall.status ?? 'pending');
      const status: ExecutorItem['status'] = state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : 'running';
      const content = toolCall.content === undefined ? '' : textOf(toolCall.content) || previewOf(toolCall.content);
      const item: ExecutorItem = { id, kind: 'tool', nativeTool: true, role: 'system', name: label, text: content || label, executionId: turn.executionId, status };
      turn.items.set(id, item); turn.tools.set(id, { id, label, status: status === 'running' ? 'running' : status === 'completed' ? 'completed' : 'unknown' });
      turn.onEvent({ type: 'item', item });
      return;
    }
    if (kind === 'plan') {
      const entries = Array.isArray(update.entries) ? update.entries as Array<Record<string, unknown>> : [];
      const text = entries.map(entry => typeof entry.content === 'string' ? entry.content : '').filter(Boolean).join('\n');
      if (!text) return;
      const id = `plan:${turn.executionId}`;
      const item: ExecutorItem = { id, kind: 'notice', role: 'assistant', text, executionId: turn.executionId, status: 'running' };
      turn.items.set(id, item); turn.onEvent({ type: 'item', item });
    }
  }

  private async serverRequest(request: AcpServerRequest): Promise<unknown> {
    if (request.method !== 'session/request_permission') throw new Error('acp_request_unsupported');
    const turn = this.turn; if (!turn) return { outcome: { outcome: 'cancelled' } };
    const params = request.params ?? {};
    const options = Array.isArray(params.options) ? params.options as Array<Record<string, unknown>> : [];
    const toolCall = params.toolCall && typeof params.toolCall === 'object' ? params.toolCall as Record<string, unknown> : {};
    const requestId = `qoder-cn-${request.id}`;
    const pending: ExecutorRequest = {
      id: requestId, kind: 'approval', blocking: true,
      title: typeof toolCall.title === 'string' && toolCall.title ? toolCall.title : 'Qoder CN 请求批准工具操作',
      ...(typeof toolCall.kind === 'string' ? { description: toolCall.kind } : {}),
    };
    turn.status = 'waiting';
    const settled = new Promise<unknown>(resolve => {
      turn.approvals.set(requestId, { request: pending, options, settle: resolve });
    });
    turn.onEvent({ type: 'request', request: pending });
    return await settled;
  }

  private observation(): ExecutorObservation {
    const turn = this.turn;
    if (!turn) return { status: 'idle', tools: [] };
    return {
      status: turn.status,
      ...(['idle', 'stopped'].includes(turn.status) ? {} : { executionRef: this.executionRef(turn.executionId) }),
      tools: [...turn.tools.values()],
      requests: [...turn.approvals.values()].map(approval => approval.request),
      ...(turn.diagnostic ? { diagnostic: turn.diagnostic } : {}),
    };
  }

  private executionRef(id: string) { return { id, data: { native: opaqueReference('qoder-cn', id, this.config, this.bindingIdentity) } }; }

  private reference(context: ContextRef, cwd?: string): string {
    const saved = this.contexts.get(context.id) ?? (typeof context.data?.cwd === 'string' ? context.data.cwd : undefined);
    if (!saved || cwd && saved !== cwd) throw new Error('agent_context_binding_mismatch');
    if (parseReference(String(context.data?.native ?? ''), 'qoder-cn', saved, this.bindingIdentity).nativeSessionId !== context.id) throw new Error('agent_context_binding_mismatch');
    this.contexts.set(context.id, saved); return saved;
  }

  private async session(cwd: string): Promise<string> {
    if (this.sessionId) return this.sessionId;
    const client = await this.transport();
    const result = await client.request('session/new', { cwd, mcpServers: [] }, 60_000);
    const id = typeof result?.sessionId === 'string' ? result.sessionId : typeof result?.session_id === 'string' ? result.session_id : undefined;
    if (!id) throw new Error('qoder_cn_session_invalid');
    this.sessionId = id; this.sessionContext = cwd;
    this.configOptions = selectOptions(result?.configOptions);
    return id;
  }

  /** The CN account authorizes only a subset of the catalog; `auto` is not always one of them. */
  private async selectModel(model: string | undefined, reasoningEffort: string | undefined): Promise<void> {
    const client = await this.transport(); const sessionId = this.sessionId;
    if (!client || !sessionId) return;
    const modelOption = this.configOptions.get('model');
    if (model) {
      const available = modelOption?.options?.map(option => option.value) ?? [];
      if (!available.includes(model)) {
        if (!available.length) return;
        throw new Error(`qoder_cn_model_unavailable: 当前账号未授权模型 ${model}，可用：${available.join('、')}`);
      }
      const updated = await client.request('session/set_config_option', { sessionId, configId: 'model', value: model }, 30_000);
      this.configOptions = selectOptions(updated?.configOptions);
    }
    if (reasoningEffort) {
      const effort = this.configOptions.get('reasoning_effort');
      const available = effort?.options?.map(option => option.value) ?? [];
      if (available.length && !available.includes(reasoningEffort)) throw new Error(`qoder_cn_reasoning_unavailable: 当前模型不支持推理强度 ${reasoningEffort}，可用：${available.join('、')}`);
      if (available.includes(reasoningEffort)) {
        const updated = await client.request('session/set_config_option', { sessionId, configId: 'reasoning_effort', value: reasoningEffort }, 30_000);
        this.configOptions = selectOptions(updated?.configOptions);
      }
    }
  }

  async inspectAccount(): Promise<AccountObservation> {
    try {
      const client = await this.transport();
      await client.request('session/new', { cwd: this.config, mcpServers: [] }, 30_000);
      return { status: 'ready', label: product.label, loginMethod: `${product.label} 账号` };
    } catch (error) {
      const message = messageOf(error, '');
      if (/auth/i.test(message) || /unauthenticated/i.test(message)) return { status: 'not-authenticated', diagnostic: `请先登录 ${product.label} 账号。` };
      return { status: 'failed', diagnostic: `${product.label} 账号检查未完成，请检查网络或程序连接后重试。` };
    }
  }

  async models(): Promise<Array<{ id: string; label: string; images?: boolean; tools?: boolean }>> { return []; }
  async modelIdentity(): Promise<string> { return `${product.id}:` + (await readQoderIdentity(this.config)).userID; }
  async requestModel(path: string, init: RequestInit = {}, expectedIdentity?: string): Promise<Response> {
    return requestQoderModel(this.config, path, init, fetch, expectedIdentity, product.id);
  }

  async beginLogin(update: (value: LoginObservation) => void): Promise<void> {
    await this.cancelLogin(); update({ state: 'initializing' });
    const command = nativeCommand(this.executable);
    const child = spawn(command.command, [...command.prefix, 'login'], { cwd: this.config, env: { ...this.environments, BROWSER: process.platform === 'win32' ? 'cmd /c exit 1' : '/usr/bin/false' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const login = { child, cancelled: false, update }; this.login = login;
    let text = ''; let currentUrl = '';
    const read = (chunk: Buffer) => {
      if (this.login !== login || login.cancelled) return;
      text = (text + chunk.toString()).slice(-65536).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      for (const value of text.match(/https:\/\/[^\s"'<>]+/g) ?? []) {
        let url: URL; try { url = new URL(value); } catch { continue; }
        if (product.loginHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host)) && value !== currentUrl) { currentUrl = value; update({ state: 'waiting-browser', url: url.href }); }
      }
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
    try {
      const status = await bounded(new Promise<number | null>((resolve, reject) => { child.once('exit', resolve); child.once('error', () => reject(new Error('qoder_cn_login_failed'))); }), 15 * 60 * 1000);
      if (this.login !== login || login.cancelled) return;
      if (status !== 0) { update({ state: 'failed', diagnostic: 'qoder_cn_login_failed' }); return; }
      update({ state: 'checking' }); const account = await inspectQoderLogin(this.config, product.id);
      if (this.login !== login) return;
      if (account.status === 'ready') update({ state: 'completed' });
      else update({ state: account.status === 'expired' ? 'expired' : 'failed', diagnostic: account.diagnostic ?? 'qoder_cn_account_not_ready' });
    } catch { if (this.login === login) { await closeOwnedProcess(child); update({ state: 'expired' }); } }
    finally { text = ''; if (this.login === login) this.login = undefined; }
  }

  async cancelLogin(): Promise<void> { const login = this.login; if (!login) return; this.login = undefined; login.cancelled = true; await closeOwnedProcess(login.child); login.update({ state: 'cancelled' }); }

  async createContext({ cwd }: { cwd: string }): Promise<ContextRef> {
    const id = randomUUID(); this.contexts.set(id, cwd);
    return { id, data: { cwd, native: opaqueReference('qoder-cn', id, cwd, this.bindingIdentity) } };
  }

  async resumeContext({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<void> {
    this.reference(contextRef, cwd);
    throw new Error('qoder_cn_resume_unsupported');
  }

  async readHistory({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<ExecutorItem[]> {
    this.reference(contextRef, cwd);
    return this.turn ? [...this.turn.items.values()] : [];
  }

  async prepareContext(input: { contextRef: ContextRef; cwd: string; model?: string; reasoningEffort?: string }): Promise<void> {
    this.reference(input.contextRef, input.cwd);
    await this.session(input.cwd);
    await this.selectModel(input.model, input.reasoningEffort);
  }

  async send(input: ExecutorSendInput): Promise<void> {
    const cwd = this.reference(input.contextRef, input.cwd);
    if (this.turn && ['running', 'waiting'].includes(this.turn.status)) throw new Error('agent_native_turn_active');
    const executionId = input.clientRequestId;
    const turn: TurnState = { executionId, onEvent: input.onEvent, items: new Map(), tools: new Map(), approvals: new Map(), status: 'running' };
    this.turn = turn;
    input.onEvent({ type: 'accepted', executionRef: this.executionRef(executionId), inputItemId: executionId });
    const userItem: ExecutorItem = { id: `user:${executionId}`, kind: 'message', role: 'user', text: input.text, clientRequestId: executionId, executionId, status: 'completed' };
    turn.items.set(userItem.id, userItem); input.onEvent({ type: 'item', item: userItem });
    try {
      const sessionId = await this.session(cwd);
      await this.selectModel(input.model, input.reasoningEffort);
      const client = await this.transport();
      const prompt = [{ type: 'text', text: input.text }, ...await Promise.all(input.images.map(async image => ({ type: 'image', data: (await readFile(image.path)).toString('base64'), mimeType: image.mimeType })))];
      const result = await client.request('session/prompt', { sessionId, prompt }, 24 * 60 * 60 * 1000);
      const stopReason = typeof result?.stopReason === 'string' ? result.stopReason : undefined;
      turn.status = stopReason === 'cancelled' || stopReason === 'refusal' ? 'stopped' : 'idle';
      if (stopReason && !['end_turn', 'max_tokens', 'cancelled', 'refusal'].includes(stopReason)) turn.diagnostic = `Qoder CN 本轮结束原因：${stopReason}。`;
    } catch (error) {
      const message = messageOf(error, 'qoder_cn_prompt_failed');
      // The CN gateway reports a missing plan as an HTTP 403 carrying a pricing link.
      const diagnostic = quotaMessage(message);
      if (turn.status !== 'stopped' && this.turn === turn) { turn.status = 'unknown'; turn.diagnostic = diagnostic; }
      throw new Error(diagnostic);
    } finally {
      for (const approval of turn.approvals.values()) { try { input.onEvent({ type: 'request-resolved', requestId: approval.request.id }); } catch { /* preserve original */ } }
      turn.approvals.clear();
      try { input.onEvent({ type: 'observation', observation: this.observation() }); } catch { /* preserve original */ }
    }
  }

  async observe(): Promise<ExecutorObservation> { return this.observation(); }

  async reply(input: { contextRef: ContextRef; requestId: string; answer: unknown }): Promise<void> {
    this.reference(input.contextRef);
    const approval = this.turn?.approvals.get(input.requestId);
    if (!approval) throw new Error('agent_request_not_found');
    this.turn!.approvals.delete(input.requestId);
    this.turn!.status = 'running';
    approval.settle(permissionOutcome(approval.options, input.answer));
    this.turn!.onEvent({ type: 'request-resolved', requestId: input.requestId });
  }

  async stop(input: { contextRef: ContextRef }): Promise<ExecutorObservation> {
    this.reference(input.contextRef);
    const turn = this.turn; if (!turn) return this.observation();
    if (this.sessionId) this.client?.notify('session/cancel', { sessionId: this.sessionId });
    for (const approval of turn.approvals.values()) approval.settle({ outcome: { outcome: 'cancelled' } });
    turn.approvals.clear(); turn.status = 'stopped';
    return this.observation();
  }

  async verifyUpgrade(): Promise<void> { await this.session(this.config); }

  async close(): Promise<void> {
    if (this.closedFlag) return;
    this.closedFlag = true; this.sessionId = undefined; this.sessionContext = undefined;
    await this.cancelLogin();
    await this.client?.close();
  }
}

function permissionOutcome(options: Array<Record<string, unknown>>, answer: unknown): unknown {
  const value = answer && typeof answer === 'object' ? answer as Record<string, unknown> : {};
  if (value.selected !== undefined) {
    const index = Number(value.selected);
    const option = Number.isInteger(index) ? options[index] : options.find(item => item.optionId === value.selected);
    if (option && typeof option.optionId === 'string') return { outcome: { outcome: 'selected', optionId: option.optionId } };
  }
  if (typeof value.optionId === 'string') return { outcome: { outcome: 'selected', optionId: value.optionId } };
  const allow = options.find(option => /^(allow|approved)/i.test(String(option.kind ?? option.optionId ?? ''))) ?? options.find(option => /allow/i.test(String(option.name ?? '')));
  if (value.approved === true && allow && typeof allow.optionId === 'string') return { outcome: { outcome: 'selected', optionId: allow.optionId } };
  return { outcome: { outcome: 'cancelled' } };
}
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string' ? String((part as Record<string, unknown>).text) : '').join('');
  if (content && typeof content === 'object' && typeof (content as Record<string, unknown>).text === 'string') return String((content as Record<string, unknown>).text);
  return '';
}
function previewOf(content: unknown): string {
  try { return typeof content === 'string' ? content : JSON.stringify(content ?? '').slice(0, 4000); } catch { return ''; }
}
function messageOf(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback; }
/** The CN gateway reports a missing or spent plan as 402/403 carrying a pricing link. */
function quotaMessage(message: string): string {
  const quota = /pricingUrl|\/pricing/i.test(message) || /quota|credit/i.test(message) && /\((?:402|403)\)|\b(?:402|403)\b/.test(message);
  return quota ? 'Qoder CN 当前账号套餐额度不足或没有可用套餐，请更换可用账号或购买套餐后继续。' : message;
}

export function createQoderCnExecutor(): AgentExecutor {
  return { nativeContent: input => qoderContent(input, 'qoder-cn'), storage: qoderStorage(), descriptor: { id: 'qoder-cn', label: product.label, capabilities }, open: options => QoderCnRuntime.open(options) };
}
