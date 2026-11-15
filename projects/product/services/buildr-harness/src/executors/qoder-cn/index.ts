import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { readQoderIdentity, requestQoderModel, inspectQoderLogin } from '../../model-access/providers/qoder.ts';
import { AcpClient, type AcpServerRequest } from '../qoder/acp.ts';
import { createQoderNativeContent } from '../qoder/content.ts';
import { qoderExecutorDescriptor } from '../qoder/index.ts';
import { qoderProduct } from '../qoder/product.ts';
import { qoderStorage } from '../qoder/storage.ts';
import { qoderForm } from './forms.ts';
import { readQoderCnUsage } from './usage.ts';
import { qoderCnFinishedTurns, qoderCnPromptReceipt, qoderCnTerminalReconciliation, readQoderCnPersistedExecution, readQoderCnTranscriptAppend, readQoderCnSupplementReceipt } from './transcript.ts';
import { nativeContentFiles } from '../native-content.ts';
import { interactionPolicy } from '../../domain/interaction-policy.ts';
import { instructionParticipation } from '../../domain/participation.ts';
import { isCompatibleProgram, nativeProgramPolicy } from '../program-policy.ts';
import { accountEnvironment, findExecutable, inspectVersion, nativeCommand, nativeHome, opaqueReference, parseReference, privateDirectories, bounded, closeOwnedProcess, releasedNativeControl } from '../native-process.ts';
import { checkedGateway, consumerBinding, gatewayModel, type ExecutorGateway } from '../model-gateway.ts';
import { qoderGatewayPolicy } from '../qoder/gateway.ts';
import { generateGatewayTitle } from '../model-title.ts';
import { generateQoderNativeTitle } from '../qoder/model-title.ts';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { AgentServiceError } from '../../domain/agent-state.ts';
import { errorDiagnostic } from '../../domain/error-diagnostic.ts';
import { ExecutorInputRejected } from '../../contracts.ts';
import type { AccountObservation, AgentExecutor, AgentRuntime, ContextRef, ExecutorEvent, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorRequest, ExecutorSendInput, ExecutorSupplementInput, ExecutorInputReceipt, ExecutorTitleInput, LoginObservation, PermissionMode } from '../../contracts.ts';

const product = qoderProduct('qoder-cn');
// Qoder CN defaults AI responses to English when `language` is empty. Buildr's
// product language is Chinese, so pin the native system prompt language at launch.
const responseLanguageSettings = JSON.stringify({ language: 'Chinese' });
const progressLanguageInstruction = '面向用户的进展说明使用简体中文，包括调用工具前、工具返回后和连续工具调用之间说明当前进展或下一步。引用命令、代码、路径、标识符、错误消息或工具输出时保留原文。';
const capabilities = { interaction: { policy: interactionPolicy.version, nonBlockingQuestions: false }, supplement: true, permissionModes: ['default', 'full-access'] as PermissionMode[], text: true, images: true, maxImageBytes: 8 * 1024 * 1024, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 96 * 1024 };

interface PendingApproval {
  request: ExecutorRequest;
  options: Array<Record<string, unknown>>;
  settle(value: unknown): void;
  answer?(value: unknown): unknown;
  toolCallId?: string;
}
interface SelectOption { id?: string; currentValue?: string; options?: Array<{ value: string; name?: string }> }
function selectOptions(value: unknown): Map<string, SelectOption> {
  const map = new Map<string, SelectOption>();
  for (const option of Array.isArray(value) ? value as SelectOption[] : []) if (option && typeof option.id === 'string' && Array.isArray(option.options)) {
    const options = option.options.flatMap(entry => 'options' in entry && Array.isArray(entry.options) ? entry.options : [entry]);
    map.set(option.id, { ...option, options });
  }
  return map;
}
interface Deferred<T> { promise: Promise<T>; resolve(value: T): void }
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(value => { resolve = value; });
  return { promise, resolve };
}
interface NativePromptCompletion { stopReason: string; text?: string; timestamp?: string }
interface NativePromptWait {
  clientRequestId?: string;
  text: string;
  admittedAt: number;
  receipt?: { id: string; promptId?: string; timestamp?: string };
  completion?: NativePromptCompletion;
  terminal: Deferred<NativePromptCompletion>;
}
interface TurnState {
  contextId: string;
  executionId: string;
  onEvent: (event: ExecutorEvent) => void;
  items: Map<string, ExecutorItem>;
  tools: Map<string, { id: string; label: string; status: 'running' | 'completed' | 'unknown' }>;
  independentTools: Set<string>;
  approvals: Map<string, PendingApproval>;
  approvalPendingTools: Set<string>;
  status: ExecutorObservation['status'];
  diagnostic?: string;
  textSegment?: { id: string; kind: string; nativeId?: string };
  segment: number;
  lastMessage?: { id: string; superseded: boolean };
  pending: boolean;
  cancelRequested: boolean;
  settled: Promise<void>;
  settle(): void;
  supplements: Map<string, Promise<void>>;
  supplementFailed?: boolean;
  supplementInputs: Map<string, { digest: string; work: Promise<ExecutorInputReceipt> }>;
  durableReceipts: Map<string, string>;
  nativePrompts: NativePromptWait[];
  nativeScan?: { file?: string; offset: number; rows: any[]; broken?: boolean };
  stopReason?: string;
  stopping?: Promise<ExecutorObservation>;
  stopConfirmed?: boolean;
  usageKey?: string;
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
  private admitting = false;
  private readonly history = new Map<string, Map<string, ExecutorItem>>();
  private loading = false;
  private readonly gateway?: ExecutorGateway;
  private readonly contexts = new Map<string, string>();
  private login?: { child: ChildProcessWithoutNullStreams; cancelled: boolean; update: (value: LoginObservation) => void };

  private constructor(bindingIdentity: string, config: string, environments: NodeJS.ProcessEnv, gateway?: ExecutorGateway) {
    this.bindingIdentity = bindingIdentity; this.config = config; this.environments = environments; this.gateway = gateway;
    this.participationInstruction = instructionParticipation('interaction-policy', interactionPolicy.instructions);
  }

  get closed(): boolean { return this.closedFlag || this.client?.transportClosed === true; }

  static async open(options: ExecutorOpenOptions): Promise<QoderCnRuntime> {
    options.signal?.throwIfAborted();
    const gateway = checkedGateway(options.gateway, { executorId: 'qoder-cn', nativeBinding: 'gateway-lease' });
    // The CN CLI selects native account models; a lease without a CN native model has no route here.
    if (gateway && gateway.nativeModel?.provider !== 'qoder-cn') throw new Error('qoder_cn_model_source_unsupported');
    const { home, temporary } = nativeHome(options.configRoot);
    const config = join(options.nativeAccountConfigRoot ?? options.configRoot, product.configDirectory);
    const env = accountEnvironment(options.environment, home, temporary, { [product.configEnvironment]: config }, options.cacheRoot);
    await privateDirectories(options.configRoot, config, ...(env.HOME === home ? [home] : []), ...(env.TMPDIR === temporary ? [temporary] : []));
    const executable = await findExecutable(options.executable, product.executableNames, env);
    const version = await inspectVersion(executable, env, options.signal);
    if (!isCompatibleProgram('qoder-cn', version)) throw new Error(`qoder_cn_version_unsupported: requires ${nativeProgramPolicy('qoder-cn').compatibility}`);
    const binding = await consumerBinding('qoder-cn', executable, version, config, options);
    const runtime = new QoderCnRuntime(binding.identity, config, env, gateway);
    runtime.executable = executable;
    runtime.bindingData = binding.data;
    if (gateway) await runtime.assertNativeAccount();
    return runtime;
  }

  private async transport(): Promise<AcpClient> {
    this.closedFlag && (() => { throw new Error('qoder_cn_closed'); })();
    if (this.client && !this.client.transportClosed) return this.client;
    if (this.opening) return await this.opening;
    this.opening = (async () => {
      const client = AcpClient.open({
        executable: this.executable,
        args: ['--acp', '--settings', responseLanguageSettings, '--append-system-prompt', progressLanguageInstruction],
        cwd: this.config, environment: this.environments,
        onNotification: (method, params) => this.notification(method, params),
        onServerRequest: request => this.serverRequest(request),
        onExit: () => this.transportLost(),
      });
      try {
        // The CLI owns filesystem tools; client-side filesystem RPCs are not implemented.
        await client.request('initialize', { protocolVersion: 1, clientCapabilities: { elicitation: { form: {} } } }, 30_000);
        return client;
      } catch (error) { await client.close(); throw error; }
    })().finally(() => { this.opening = undefined; });
    this.client = await this.opening;
    return this.client;
  }

  private transportLost(): void {
    this.sessionId = undefined; this.sessionContext = undefined;
    const turn = this.turn; if (!turn?.pending) return;
    turn.status = 'unknown';
    turn.diagnostic = 'Qoder CN 连接已中断，本轮执行结果未知；请重新检查后再继续。';
    this.finishText(turn, 'unknown');
    for (const tool of turn.tools.values()) if (tool.status === 'running') tool.status = 'unknown';
    for (const approval of turn.approvals.values()) { approval.settle(approval.request.kind==='question'?{action:'cancel'}:{ outcome: { outcome: 'cancelled' } }); try { turn.onEvent({ type: 'request-resolved', requestId: approval.request.id }); } catch { /* keep transport closed */ } }
    turn.approvals.clear();
    try { turn.onEvent({ type: 'observation', observation: this.observation() }); } catch { /* original transport stays closed */ }
  }

  private notification(method: string, params: Record<string, unknown>): void {
    // session/load replays the stored transcript; it is history, not this turn's output.
    if (this.loading || method !== 'session/update') return;
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : typeof params.session_id === 'string' ? params.session_id : undefined;
    if (!sessionId || sessionId !== this.sessionId) return;
    const update = params.update as Record<string, unknown> | undefined; if (!update) return;
    const kind = String(update.sessionUpdate ?? update.session_update ?? '');
    if (kind === 'config_option_update') { this.configOptions = selectOptions(update.configOptions); return; }
    const turn = this.turn; if (!turn?.pending || turn.contextId !== sessionId) return;
    if(kind==='usage_update') {
      const used=update.used,window=update.size;
      if(Number.isSafeInteger(used)&&Number(used)>=0&&Number.isSafeInteger(window)&&Number(window)>0)
        turn.onEvent({type:'context-usage',usedTokens:Number(used),windowTokens:Number(window)});
      return;
    }
    // send() already projected this input. Native echoes are not supplements.
    if (kind === 'user_message_chunk') return;
    if (kind === 'agent_message_chunk' || kind === 'agent_thought_chunk') {
      const text = textOf(update.content); if (!text) return;
      const nativeId = typeof update.messageId === 'string' ? update.messageId : undefined;
      if (turn.textSegment && (turn.textSegment.kind !== kind || turn.textSegment.nativeId !== nativeId)) this.finishText(turn);
      const id = turn.textSegment?.id ?? `${kind === 'agent_thought_chunk' ? 'thinking' : 'message'}:${turn.executionId}:${++turn.segment}`;
      turn.textSegment = { id, kind, nativeId };
      // Track the terminal message segment so close-out can reconcile it against
      // the authoritative native text. Thinking or a tool after a message marks it
      // intermediate; a later message starts a fresh terminal segment.
      if (kind === 'agent_thought_chunk') { if (turn.lastMessage) turn.lastMessage.superseded = true; }
      else turn.lastMessage = { id, superseded: false };
      const prior = turn.items.get(id);
      const item: ExecutorItem = {
        ...(prior ?? {}), id, role: 'assistant',
        kind: kind === 'agent_thought_chunk' ? 'thinking' : 'message', text: (prior?.text ?? '') + text,
        ...(kind === 'agent_thought_chunk' ? { thinking: true } : {}), executionId: turn.executionId, status: 'running',
      };
      this.item(turn, item);
      return;
    }
    if (kind === 'tool_call' || kind === 'tool_call_update') {
      this.finishText(turn);
      if (turn.lastMessage) turn.lastMessage.superseded = true;
      const toolCall = update.toolCall && typeof update.toolCall === 'object' ? update.toolCall as Record<string, unknown> : update;
      const id = typeof toolCall.toolCallId === 'string' ? toolCall.toolCallId : typeof toolCall.tool_call_id === 'string' ? toolCall.tool_call_id : undefined;
      if (!id) return;
      const prior = turn.items.get(id);
      // ACP execute calls can leave native background tasks outside the control
      // group. Without their own terminal receipt, group exit proves no outcome.
      if(toolCall.kind==='execute'||toolCall.kind==='other')turn.independentTools.add(id);
      const label = typeof toolCall.title === 'string' && toolCall.title ? toolCall.title : prior?.name ?? (typeof toolCall.kind === 'string' ? toolCall.kind : '工具');
      const state = toolCall.status;
      const status: ExecutorItem['status'] = state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : state === undefined ? prior?.status ?? 'running' : 'running';
      const content = toolCall.content === undefined ? '' : textOf(toolCall.content) || previewOf(toolCall.content);
      const item: ExecutorItem = { ...prior, id, kind: 'tool', nativeTool: true, role: 'system', name: label, text: content || prior?.text || label, ...(toolCall.rawInput === undefined ? {} : { input: previewOf(toolCall.rawInput) }), executionId: turn.executionId, status };
      // Failure is an observed end, not a successful result or an unknown live command.
      turn.tools.set(id, { id, label, status: status === 'running' ? 'running' : status === 'completed' || status === 'failed' ? 'completed' : 'unknown' });
      this.item(turn, item);
      return;
    }
    if (kind === 'plan') {
      this.finishText(turn);
      const entries = Array.isArray(update.entries) ? update.entries as Array<Record<string, unknown>> : [];
      const text = entries.map(entry => typeof entry.content === 'string' ? entry.content : '').filter(Boolean).join('\n');
      if (!text) return;
      const id = `plan:${turn.executionId}`;
      const item: ExecutorItem = { id, kind: 'notice', role: 'assistant', text, executionId: turn.executionId, status: 'running' };
      this.item(turn, item);
    }
  }

  private item(turn: TurnState, item: ExecutorItem): void {
    turn.items.set(item.id, item);
    let history = this.history.get(turn.contextId);
    if (!history) this.history.set(turn.contextId, history = new Map());
    history.set(item.id, item);
    turn.onEvent({ type: 'item', item });
  }

  private finishText(turn: TurnState, status: ExecutorItem['status'] = 'completed'): void {
    const id = turn.textSegment?.id;
    turn.textSegment = undefined;
    const prior = id ? turn.items.get(id) : undefined;
    if (prior) this.item(turn, { ...prior, status });
  }

  /** Qoder CN's ACP terminal frame can outrun the final text chunks (or the whole
   * terminal message). The append-only transcript still records the authoritative
   * end_turn text, so at close-out reconcile the projected terminal message against
   * it once: overwrite a truncated prefix, or project a wholly lost terminal message.
   * A bounded short wait covers the transcript flush lag; on timeout keep the current
   * behavior without pretending completeness. Thinking items are never touched. */
  private async reconcileFinalText(turn: TurnState, normal: boolean): Promise<void> {
    if (!normal) return;
    const scan = turn.nativeScan; if (!scan || scan.broken) return;
    const cwd = this.contexts.get(turn.contextId); if (!cwd) return;
    const prompt = [...turn.nativePrompts].reverse().find(value => value.receipt) ?? turn.nativePrompts[0];
    if (!prompt) return;
    const terminalText = (): string | undefined => {
      if (prompt.completion?.text) return prompt.completion.text;
      if (!prompt.receipt) return undefined;
      const finished = qoderCnFinishedTurns(scan.rows, turn.contextId, cwd);
      const completion = prompt.receipt.promptId
        ? finished.byPromptId.get(prompt.receipt.promptId) ?? finished.byReceiptId.get(prompt.receipt.id)
        : finished.byReceiptId.get(prompt.receipt.id);
      return completion?.text;
    };
    let nativeText = terminalText();
    if (!nativeText) {
      const deadline = Date.now() + 2000;
      while (!nativeText && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 250));
        this.scanNativeTurn(turn);
        nativeText = terminalText();
      }
    }
    if (!nativeText) return;
    const last = turn.lastMessage ? turn.items.get(turn.lastMessage.id) : undefined;
    const lastIsMessage = last && last.kind === 'message' && last.role === 'assistant';
    const decision = qoderCnTerminalReconciliation(lastIsMessage ? last.text : undefined, nativeText, Boolean(turn.lastMessage?.superseded));
    if (decision.action === 'noop') return;
    if (decision.action === 'overwrite' && last) { this.item(turn, { ...last, text: nativeText, status: 'completed' }); return; }
    // The terminal message was never projected (wholly lost) or the last message is
    // an intermediate one; project the authoritative terminal text as the final reply.
    this.item(turn, {
      id: `message:${turn.executionId}:${++turn.segment}`, kind: 'message', role: 'assistant',
      text: nativeText, executionId: turn.executionId, status: 'completed',
    });
  }

  private observeUsage(turn: TurnState): void {
    if(this.turn!==turn||turn.contextId!==this.sessionId)return;
    const usage=readQoderCnUsage(this.config,turn.contextId,this.sessionContext!);
    if(!usage||usage.key===turn.usageKey)return;
    turn.usageKey=usage.key;
    // The native request count is authoritative even when no native window is
    // reported. The UI already distinguishes the configured and reported window.
    turn.onEvent({type:'context-usage',...(usage.usedTokens===undefined?{}:{usedTokens:usage.usedTokens}),...(usage.usedRatio===undefined?{}:{usedRatio:usage.usedRatio})});
  }

  private transcriptFile(contextId: string): string | undefined {
    const cwd = this.contexts.get(contextId); if (!cwd) return;
    const root = dirname(this.config);
    const files = nativeContentFiles({ root, configRoot: root, contextId, cwd }, join(this.config, 'projects'), file => basename(file) === `${contextId}.jsonl`, 3);
    return files.length === 1 ? files[0] : undefined;
  }

  /** Baseline native evidence at admission; only later rows can prove this turn. */
  private startNativeScan(turn: TurnState): void {
    let offset = 0;
    const file = this.transcriptFile(turn.contextId);
    if (file) try {
      const stat = fs.lstatSync(file);
      if (stat.isFile() && !stat.isSymbolicLink()) offset = stat.size;
    } catch { /* A new native session may create its transcript after admission. */ }
    turn.nativeScan = { ...(file ? { file } : {}), offset, rows: [] };
  }

  /** Qoder CN 1.1.86 can finish a native turn without sending the ACP
   * `session/prompt` response. Its append-only transcript still records the exact
   * human prompt and terminal stop reason, so use those facts without replaying
   * any input. Exact text plus append offset prevents historical misattribution. */
  private scanNativeTurn(turn: TurnState): void {
    const scan = turn.nativeScan;
    if (!scan || scan.broken) return;
    try {
      const file = scan.file ??= this.transcriptFile(turn.contextId);
      if (!file) return;
      const delta = readQoderCnTranscriptAppend(file, scan.offset);
      if (!delta) return;
      scan.offset = delta.offset;
      if (!delta.rows.length) return;
      scan.rows.push(...delta.rows);
      const cwd = this.contexts.get(turn.contextId); if (!cwd) return;
      for (const row of delta.rows) {
        const receipt = qoderCnPromptReceipt(row, turn.contextId, cwd);
        if (!receipt) continue;
        const receiptAt = receipt.timestamp ? Date.parse(receipt.timestamp) : NaN;
        const prompt = turn.nativePrompts.find(value => !value.receipt && value.text === receipt.text &&
          Number.isFinite(receiptAt) && receiptAt + 1000 >= value.admittedAt);
        if (!prompt) continue;
        prompt.receipt = { id: receipt.id, ...(receipt.promptId ? { promptId: receipt.promptId } : {}), ...(receipt.timestamp ? { timestamp: receipt.timestamp } : {}) };
        if (!prompt.clientRequestId || turn.durableReceipts.has(prompt.clientRequestId)) continue;
        turn.durableReceipts.set(prompt.clientRequestId, receipt.id);
        this.item(turn, { id: receipt.id, clientRequestId: prompt.clientRequestId, kind: 'message', role: 'user', text: prompt.text, executionId: turn.executionId, status: 'completed' });
      }
      const finished = qoderCnFinishedTurns(scan.rows, turn.contextId, cwd);
      for (const prompt of turn.nativePrompts) {
        if (!prompt.receipt || prompt.completion) continue;
        const completion = prompt.receipt.promptId
          ? finished.byPromptId.get(prompt.receipt.promptId) ?? finished.byReceiptId.get(prompt.receipt.id)
          : finished.byReceiptId.get(prompt.receipt.id);
        if (!completion) continue;
        prompt.completion = completion;
        prompt.terminal.resolve(completion);
      }
    } catch { /* best-effort native evidence; ACP response remains primary */ }
  }

  private async serverRequest(request: AcpServerRequest): Promise<unknown> {
    if (request.method !== 'session/request_permission' && request.method !== 'elicitation/create') throw new Error('acp_request_unsupported');
    const turn = this.turn;
    const cancelled = request.method === 'elicitation/create' ? { action: 'cancel' } : { outcome: { outcome: 'cancelled' } };
    if (!turn?.pending || turn.cancelRequested || request.params?.sessionId !== turn.contextId) return cancelled;
    const params = request.params ?? {};
    if (request.method === 'elicitation/create') {
      let form:ReturnType<typeof qoderForm>;
      try { form=qoderForm(params, `qoder-cn-form-${request.id}`); }
      catch {
        turn.onEvent({type:'diagnostic',message:'Qoder CN 请求了当前界面无法安全表达的表单，已取消该表单，不会自动代答或转为工具批准。'});
        return {action:'cancel'};
      }
      turn.status = 'waiting';
      const result = new Promise<unknown>(resolve => {
        turn.approvals.set(form.request.id, { request: form.request, options: [], settle: resolve, answer: form.answer });
      });
      turn.onEvent({ type: 'request', request: form.request });
      return await result;
    }
    const options = Array.isArray(params.options) ? params.options as Array<Record<string, unknown>> : [];
    const toolCall = params.toolCall && typeof params.toolCall === 'object' ? params.toolCall as Record<string, unknown> : {};
    const toolCallId = typeof toolCall.toolCallId === 'string' ? toolCall.toolCallId : typeof toolCall.tool_call_id === 'string' ? toolCall.tool_call_id : undefined;
    const requestId = `qoder-cn-${request.id}`;
    const pending: ExecutorRequest = {
      id: requestId, kind: 'approval', blocking: true,
      title: typeof toolCall.title === 'string' && toolCall.title ? toolCall.title : 'Qoder CN 请求批准工具操作',
      ...(typeof toolCall.kind === 'string' ? { description: toolCall.kind } : {}),
      options: options.filter(option => typeof option.optionId === 'string').map(option => ({ id: String(option.optionId), label: String(option.name ?? option.optionId) })),
    };
    turn.status = 'waiting';
    if (toolCallId) turn.approvalPendingTools.add(toolCallId);
    const settled = new Promise<unknown>(resolve => {
      turn.approvals.set(requestId, { request: pending, options, settle: resolve, ...(toolCallId ? { toolCallId } : {}) });
    });
    turn.onEvent({ type: 'request', request: pending });
    return await settled;
  }

  private observation(): ExecutorObservation {
    const turn = this.turn;
    if (!turn) return { status: 'idle', tools: [] };
    return {
      status: turn.status,
      executionRef: this.executionRef(turn.executionId),
      tools: [...turn.tools.values()],
      requests: [...turn.approvals.values()].map(approval => approval.request),
      ...(turn.diagnostic ? { diagnostic: turn.diagnostic } : {}),
    };
  }

  private executionRef(id: string) {
    const contextId=this.turn?.contextId??this.sessionId!;
    const ref=this.client?.executionRef(id,contextId,this.bindingIdentity);
    return {id,data:{...ref?.data,native:opaqueReference('qoder-cn',id,this.config,this.bindingIdentity),resourceContext:contextId,resourceBinding:this.bindingIdentity}};
  }

  private reference(context: ContextRef, cwd?: string): string {
    const saved = this.contexts.get(context.id) ?? (typeof context.data?.cwd === 'string' ? context.data.cwd : undefined);
    if (!saved || cwd && saved !== cwd) throw new Error('agent_context_binding_mismatch');
    if (parseReference(String(context.data?.native ?? ''), 'qoder-cn', saved, this.bindingIdentity).nativeSessionId !== context.id) throw new Error('agent_context_binding_mismatch');
    this.contexts.set(context.id, saved); return saved;
  }

  private assertQuiescent(): void {
    if (this.turn && (this.turn.pending || !['idle', 'stopped'].includes(this.turn.status) || [...this.turn.tools.values()].some(tool => tool.status !== 'completed'))) throw new ExecutorInputRejected('qoder_cn_previous_execution_unsettled');
  }

  private exactTurn(contextRef: ContextRef, executionRef?: { id: string }): TurnState | undefined {
    this.reference(contextRef);
    const turn = this.turn;
    if (turn && (turn.contextId !== contextRef.id || executionRef && turn.executionId !== executionRef.id)) throw new Error('qoder_cn_execution_identity_mismatch');
    if (!turn && executionRef) throw new Error('qoder_cn_execution_unavailable');
    return turn;
  }

  private async session(cwd: string, fresh = false): Promise<string> {
    if (!fresh && this.sessionId && this.sessionContext === cwd) return this.sessionId;
    this.assertQuiescent();
    const client = await this.transport();
    const result = await client.request('session/new', { cwd, mcpServers: [] }, 60_000);
    const id = typeof result?.sessionId === 'string' ? result.sessionId : typeof result?.session_id === 'string' ? result.session_id : undefined;
    if (!id) throw new Error('qoder_cn_session_invalid');
    this.sessionId = id; this.sessionContext = cwd;
    this.configOptions = selectOptions(result?.configOptions);
    return id;
  }

  /** Resume the exact native session and keep its replay out of the live turn. */
  private async load(id: string, cwd: string): Promise<void> {
    if (this.sessionId === id && this.sessionContext === cwd) return;
    this.assertQuiescent();
    const client = await this.transport();
    this.loading = true;
    try {
      const result = await client.request('session/load', { sessionId: id, cwd, mcpServers: [] }, 60_000);
      this.sessionId = id; this.sessionContext = cwd;
      this.configOptions = selectOptions(result?.configOptions);
      this.contexts.set(id, cwd);
    } catch (error) {
      if (resumeUnavailable(error)) throw new AgentServiceError('agent_context_unavailable', '原 Qoder CN 原生会话已无法恢复，将建立新的原生会话继续本轮；此前对话记录与输入已保留。', 409);
      throw error;
    } finally { this.loading = false; }
  }

  private async assertNativeAccount(): Promise<void> {
    if (!this.gateway?.nativeModel) return;
    const identity = await readQoderIdentity(this.config);
    if (createHash('sha256').update(this.gateway.nativeModel.provider + ':' + identity.userID).digest('hex') !== this.gateway.nativeModel.accountIdentity) throw new Error('qoder_native_account_changed');
  }

  /** A gateway lease names a Buildr route; the native CLI only accepts its own model id. */
  private selection(model: string | undefined, reasoningEffort: string | undefined): { model?: string; reasoningEffort?: string } {
    if (!this.gateway) return { model, reasoningEffort };
    try {
      gatewayModel(this.gateway, model);
      const policy = qoderGatewayPolicy(this.gateway, model, reasoningEffort);
      return { model: this.gateway.nativeModel!.id, reasoningEffort: policy.parameters.reasoningEffort };
    } catch (error) {
      if (error instanceof AgentServiceError) throw error;
      throw new ExecutorInputRejected(error instanceof Error ? error.message : 'agent_gateway_model_mismatch');
    }
  }

  /** The CN account authorizes only a subset of the catalog; `auto` is not always one of them. */
  private async selectModel(model: string | undefined, reasoningEffort: string | undefined): Promise<void> {
    const client = await this.transport(); const sessionId = this.sessionId;
    if (!client || !sessionId) return;
    const modelOption = this.configOptions.get('model');
    if (model) {
      const available = modelOption?.options?.map(option => option.value) ?? [];
      if (!available.includes(model)) {
        throw new ExecutorInputRejected(`qoder_cn_model_unavailable: 当前账号未授权模型 ${model}，可用：${available.join('、')}`);
      }
      const updated = await client.request('session/set_config_option', { sessionId, configId: 'model', value: model }, 30_000);
      this.configOptions = selectOptions(updated?.configOptions);
      if (this.configOptions.get('model')?.currentValue !== model) throw new ExecutorInputRejected('qoder_cn_model_not_applied');
    }
    if (reasoningEffort) {
      const effort = this.configOptions.get('reasoning_effort');
      const available = effort?.options?.map(option => option.value) ?? [];
      if (!available.includes(reasoningEffort)) throw new ExecutorInputRejected(`qoder_cn_reasoning_unavailable: 当前模型不支持推理强度 ${reasoningEffort}，可用：${available.join('、')}`);
      if (available.includes(reasoningEffort)) {
        const updated = await client.request('session/set_config_option', { sessionId, configId: 'reasoning_effort', value: reasoningEffort }, 30_000);
        this.configOptions = selectOptions(updated?.configOptions);
        if (this.configOptions.get('reasoning_effort')?.currentValue !== reasoningEffort) throw new ExecutorInputRejected('qoder_cn_reasoning_not_applied');
      }
    }
  }

  private async selectPermission(mode: PermissionMode = 'default'): Promise<void> {
    const value = mode === 'full-access' ? 'yolo' : 'default';
    const available = this.configOptions.get('mode')?.options?.map(option => option.value) ?? [];
    if (!available.includes(value)) throw new ExecutorInputRejected(`qoder_cn_permission_unavailable: 当前程序未提供 ${mode} 对应的原生权限模式。`);
    const result = await (await this.transport()).request('session/set_config_option', { sessionId: this.sessionId!, configId: 'mode', value }, 30_000);
    this.configOptions = selectOptions(result?.configOptions);
    if (this.configOptions.get('mode')?.currentValue !== value) throw new ExecutorInputRejected('qoder_cn_permission_not_applied');
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
  /** A bounded, tool-free request on the gateway lease, or the native model channel without one. */
  async generateTitle(input: ExecutorTitleInput): Promise<string | undefined> {
    if (!this.gateway) return generateQoderNativeTitle(input, (path, init) => this.requestModel(path, init));
    return generateGatewayTitle(this.gateway, input, 'chat-completions');
  }
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
    await this.assertNativeAccount();
    const id = await this.session(cwd, true);
    this.contexts.set(id, cwd);
    return { id, data: { cwd, native: opaqueReference('qoder-cn', id, cwd, this.bindingIdentity) } };
  }

  async resumeContext({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<void> {
    this.reference(contextRef, cwd);
    await this.assertNativeAccount();
    await this.load(contextRef.id, cwd);
  }

  async readHistory({ contextRef, cwd }: { contextRef: ContextRef; cwd: string }): Promise<ExecutorItem[]> {
    this.reference(contextRef, cwd);
    const turn = this.turn;
    if (turn?.contextId === contextRef.id) this.scanNativeTurn(turn);
    return [...(this.history.get(contextRef.id)?.values() ?? [])];
  }

  async prepareContext(input: { contextRef: ContextRef; cwd: string; model?: string; reasoningEffort?: string; permissionMode?: PermissionMode }): Promise<void> {
    this.assertQuiescent();
    this.reference(input.contextRef, input.cwd);
    await this.assertNativeAccount();
    await this.load(input.contextRef.id, input.cwd);
    const selected = this.selection(input.model, input.reasoningEffort);
    await this.selectModel(selected.model, selected.reasoningEffort);
    await this.selectPermission(input.permissionMode);
  }

  async send(input: ExecutorSendInput): Promise<void> {
    const cwd = this.reference(input.contextRef, input.cwd);
    this.assertQuiescent();
    if (this.admitting) throw new ExecutorInputRejected('qoder_cn_input_admission_active');
    this.admitting = true;
    // Model and session checks happen before the accepted receipt: a rejected
    // selection never claims the input reached the native prompt.
    let prompt: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
    try {
      await this.assertNativeAccount();
      const selected = this.selection(input.model, input.reasoningEffort);
      await this.load(input.contextRef.id, cwd);
      await this.selectModel(selected.model, selected.reasoningEffort);
      await this.selectPermission(input.permissionMode);
      prompt = [{ type: 'text', text: input.text }, ...await Promise.all(input.images.map(async image => ({ type: 'image', data: (await readFile(image.path)).toString('base64'), mimeType: image.mimeType })))];
    } finally { this.admitting = false; }
    const executionId = input.clientRequestId;
    let settle!: () => void;
    const settled = new Promise<void>(resolve => { settle = resolve; });
    const primaryPrompt: NativePromptWait = { text: input.text, admittedAt: Date.now(), terminal: deferred() };
    const turn: TurnState = { contextId: input.contextRef.id, executionId, onEvent: input.onEvent, items: new Map(), tools: new Map(), independentTools: new Set(), approvals: new Map(), approvalPendingTools: new Set(), status: 'running', segment: 0, pending: true, cancelRequested: false, settled, settle, supplements: new Map(), supplementInputs: new Map(), durableReceipts: new Map(), nativePrompts: [primaryPrompt] };
    this.turn = turn;
    this.startNativeScan(turn);
    input.onEvent({ type: 'accepted', executionRef: this.executionRef(executionId), inputItemId: executionId });
    const userItem: ExecutorItem = { id: `user:${executionId}`, kind: 'message', role: 'user', text: input.text, clientRequestId: executionId, executionId, status: 'completed' };
    this.item(turn, userItem);
    this.observeUsage(turn);
    const usageTimer=setInterval(()=>{try{this.observeUsage(turn);}catch{/* local observation cannot interrupt work */}},2000);
    usageTimer.unref();
    const durableTimer=setInterval(()=>{try{this.scanNativeTurn(turn);}catch{/* native evidence is best-effort */}},1000);
    durableTimer.unref();
    try {
      const sessionId = this.sessionId!;
      const client = await this.transport();
      const request = client.request('session/prompt', { sessionId, prompt }, 24 * 60 * 60 * 1000, result => {
        const completion: NativePromptCompletion = { stopReason: typeof result?.stopReason === 'string' ? result.stopReason : 'unknown' };
        if (!primaryPrompt.completion) { primaryPrompt.completion = completion; primaryPrompt.terminal.resolve(completion); }
        if (turn.pending) { this.finishText(turn); turn.stopReason = completion.stopReason; }
      });
      // A lost terminal ACP frame must not turn a natively completed turn into
      // an endless running control. The transcript watcher resolves this waiter.
      request.catch(() => {});
      const completed = await Promise.race([
        request.then(result => ({ stopReason: typeof result?.stopReason === 'string' ? result.stopReason : 'unknown' })),
        primaryPrompt.terminal.promise,
      ]);
      if (!primaryPrompt.completion) primaryPrompt.completion = completed;
      turn.stopReason = completed.stopReason;
      this.scanNativeTurn(turn);
      // Native queued prompts belong to this Buildr execution. The first prompt
      // ending cannot release their controls or promote an intermediate answer.
      while (turn.supplements.size) await Promise.allSettled([...turn.supplements.values()]);
      // Queued supplements are independent native turns too. Wait for their
      // terminal facts, not only their durable acceptance receipts.
      for (;;) {
        const pending = turn.nativePrompts.filter(value => value.clientRequestId && !value.completion);
        if (!pending.length) break;
        await Promise.allSettled(pending.map(value => value.terminal.promise));
      }
      const supplementCompletion = turn.nativePrompts.filter(value => value.clientRequestId && value.completion).at(-1)?.completion;
      const stopReason = supplementCompletion?.stopReason ?? turn.stopReason;
      const normal = stopReason === 'end_turn';
      const stopped = turn.cancelRequested || stopReason === 'cancelled' || stopReason === 'refusal' || stopReason === 'max_tokens' || stopReason === 'max_turn_requests';
      this.finishText(turn, normal ? 'completed' : 'unknown');
      await this.reconcileFinalText(turn, normal);
      turn.status = stopped ? 'stopped' : normal ? 'idle' : 'unknown';
      if(turn.supplementFailed) { if(!turn.stopConfirmed)turn.status='unknown';turn.diagnostic='Qoder CN 追加输入或排队执行结果未确认，不会自动重发。'; }
      if (stopReason === 'max_tokens' || stopReason === 'max_turn_requests') turn.diagnostic = 'Qoder CN 输出或工具轮次达到上限，本轮回复未完整完成。';
      else if (stopReason === 'refusal') turn.diagnostic = 'Qoder CN 拒绝了本轮请求。';
      else if (!normal && !stopped) turn.diagnostic = 'Qoder CN 未返回可确认的正常结束原因，本轮结果未知。';
      // A tool that asked for permission and was never allowed to run cannot have
      // executed. The confirmed turn end settles it instead of leaving it unknown,
      // which would otherwise reject every later input for this conversation.
      for (const tool of turn.tools.values()) {
        if (tool.status !== 'running' || !turn.approvalPendingTools.has(tool.id)) continue;
        tool.status = 'completed';
        const item = turn.items.get(tool.id);
        if (item) this.item(turn, { ...item, status: 'completed', text: `${item.text ? item.text + '\n' : ''}授权等待已取消，工具未执行。` });
      }
      for (const tool of turn.tools.values()) if (tool.status === 'running') tool.status = 'unknown';
      if ([...turn.tools.values()].some(tool => tool.status !== 'completed')) { turn.status = 'unknown'; turn.diagnostic ??= 'Qoder CN 本轮仍有未确认结束的工具，结果未知。'; }
      if (turn.status === 'idle' || turn.status === 'stopped') input.onEvent({ type: 'completed', status: turn.status === 'idle' ? 'completed' : 'stopped', ...(turn.diagnostic ? { diagnostic: turn.diagnostic } : {}) });
    } catch (error) {
      const message = messageOf(error, 'qoder_cn_prompt_failed');
      // The CN gateway reports a missing plan as an HTTP 403 carrying a pricing link.
      const diagnostic = errorDiagnostic(quotaMessage(message)) ?? 'qoder_cn_prompt_failed';
      this.finishText(turn, 'unknown');
      for (const tool of turn.tools.values()) if (tool.status === 'running') tool.status = 'unknown';
      if (turn.status !== 'stopped' && this.turn === turn) { turn.status = 'unknown'; turn.diagnostic = diagnostic; }
      throw new Error(diagnostic);
    } finally {
      for (const approval of turn.approvals.values()) { try { input.onEvent({ type: 'request-resolved', requestId: approval.request.id }); } catch { /* preserve original */ } }
      turn.approvals.clear();
      while(turn.supplements.size) await Promise.allSettled([...turn.supplements.values()]);
      clearInterval(usageTimer);
      clearInterval(durableTimer);
      this.observeUsage(turn);
      turn.pending = false;
      turn.settle();
      try { input.onEvent({ type: 'observation', observation: this.observation() }); } catch { /* preserve original */ }
    }
  }

  async supplement(input: ExecutorSupplementInput): Promise<ExecutorInputReceipt> {
    this.reference(input.contextRef,input.cwd);
    const turn=this.exactTurn(input.contextRef,input.executionRef);
    if(!turn?.pending||turn.cancelRequested||turn.status==='unknown'||
      [...turn.approvals.values()].some(value=>value.request.kind==='question'))throw new ExecutorInputRejected('qoder_cn_supplement_unavailable');
    const digest=createHash('sha256').update(JSON.stringify([input.text,input.images])).digest('hex');
    const existing=turn.supplementInputs.get(input.clientRequestId);
    if(existing) {
      if(existing.digest!==digest)throw new ExecutorInputRejected('qoder_cn_supplement_conflict');
      return await bounded(existing.work,15000);
    }
    if(!turn.nativeScan) this.startNativeScan(turn);
    let nativePrompt:NativePromptWait|undefined;
    const work=(async ():Promise<ExecutorInputReceipt>=>{
      const prompt=[{type:'text',text:input.text},...await Promise.all(input.images.map(async image=>({type:'image',data:(await readFile(image.path)).toString('base64'),mimeType:image.mimeType})))];
      if(!turn.pending||turn.cancelRequested||this.turn!==turn)throw new ExecutorInputRejected('qoder_cn_supplement_stale');
      const client=await this.transport();
      const promptWait:NativePromptWait={clientRequestId:input.clientRequestId,text:input.text,admittedAt:Date.now(),terminal:deferred()};
      nativePrompt=promptWait;
      turn.nativePrompts.push(promptWait);
      const request=client.request('session/prompt',{sessionId:turn.contextId,prompt},24*60*60*1000,value=>{
        const completion:NativePromptCompletion={stopReason:typeof value?.stopReason==='string'?value.stopReason:'unknown'};
        if(!promptWait.completion)promptWait.completion=completion;
        if(turn.pending){this.finishText(turn);turn.stopReason=completion.stopReason;}
      });
      request.catch(()=>{});
      const settled=await Promise.race([
        request.then(result=>({kind:'response' as const,result})),
        promptWait.terminal.promise.then(completion=>({kind:'terminal' as const,completion})),
      ]);
      this.scanNativeTurn(turn);
      if(settled.kind==='terminal')return this.supplementReceipt(turn,input.clientRequestId);
      const result=settled.result;
      // The durable bridge-prompt record proves native acceptance even when the
      // terminal response is late or lacks its receipt; the terminal id wins when present.
      if(typeof result?.userMessageId==='string'&&result.userMessageId){
        this.item(turn,{id:result.userMessageId,clientRequestId:input.clientRequestId,kind:'message',role:'user',text:input.text,executionId:turn.executionId,status:'completed'});
        return {executionRef:this.executionRef(turn.executionId),inputItemId:result.userMessageId};
      }
      // A native receipt may land just after the terminal frame. Observe the
      // exact admitted prompt briefly, but never claim acceptance without it.
      for(const delay of [50,100,200,400,800]){
        await new Promise(resolve=>setTimeout(resolve,delay));
        this.scanNativeTurn(turn);
        const durable=turn.durableReceipts.get(input.clientRequestId);
        if(durable)return {executionRef:this.executionRef(turn.executionId),inputItemId:durable};
      }
      throw new Error('qoder_cn_supplement_receipt_missing');
    })().catch(error=>{
      if(nativePrompt&&!nativePrompt.completion){
        const completion:NativePromptCompletion={stopReason:'unknown'};
        nativePrompt.completion=completion;
        nativePrompt.terminal.resolve(completion);
      }
      throw error;
    });
    turn.supplementInputs.set(input.clientRequestId,{digest,work});
    const pending=work.then(()=>{},error=>{if(!(error instanceof ExecutorInputRejected))turn.supplementFailed=true;}).finally(()=>{turn.supplements.delete(input.clientRequestId);});
    turn.supplements.set(input.clientRequestId,pending);
    // Timeout keeps the underlying queued input and its eventual exact receipt.
    // The application can reconcile it; it must never blindly send it again.
    return await bounded(work,15000);
  }

  private supplementReceipt(turn:TurnState,clientRequestId:string):ExecutorInputReceipt {
    const durable=turn.durableReceipts.get(clientRequestId);
    if(!durable)throw new Error('qoder_cn_supplement_receipt_missing');
    return {executionRef:this.executionRef(turn.executionId),inputItemId:durable};
  }

  async observe(input: { contextRef: ContextRef; executionRef?: { id: string } }): Promise<ExecutorObservation> { this.exactTurn(input.contextRef, input.executionRef); return this.observation(); }

  async reply(input: { contextRef: ContextRef; executionRef: { id: string }; requestId: string; answer: unknown }): Promise<void> {
    const turn = this.exactTurn(input.contextRef, input.executionRef);
    const approval = turn?.pending && !turn.cancelRequested ? turn.approvals.get(input.requestId) : undefined;
    if (!approval) throw new Error('agent_request_not_found');
    const outcome = approval.answer ? approval.answer(input.answer) : permissionOutcome(approval.options, input.answer);
    // An allowed tool may now execute; it is no longer a never-run approval wait.
    if (approval.toolCallId && allowedOutcome(approval.options, outcome)) this.turn!.approvalPendingTools.delete(approval.toolCallId);
    this.turn!.approvals.delete(input.requestId);
    this.turn!.status = 'running';
    approval.settle(outcome);
    this.turn!.onEvent({ type: 'request-resolved', requestId: input.requestId });
  }

  async stop(input: { contextRef: ContextRef; executionRef?: { id: string } }): Promise<ExecutorObservation> {
    const turn = this.exactTurn(input.contextRef, input.executionRef);
    if(!turn)return this.observation();
    if(turn.stopping)return turn.stopping;
    const stopping=this.stopTurn(turn).finally(()=>{if(turn.stopping===stopping)turn.stopping=undefined;});
    turn.stopping=stopping;return stopping;
  }
  private async stopTurn(turn:TurnState):Promise<ExecutorObservation> {
    if(turn.stopConfirmed)return this.observation();
    const queued=turn.supplements.size>0;
    if (!turn.cancelRequested) {
      turn.cancelRequested = true;
      // ACP has no atomic cancel-all for its prompt queue. Terminate this exact
      // owned group before resolving decisions can release another queued prompt.
      if (!queued && this.sessionId === turn.contextId) this.client?.notify('session/cancel', { sessionId: turn.contextId });
      if(!queued){
        for (const approval of turn.approvals.values()) {
          approval.settle(approval.request.kind==='question'?{action:'cancel'}:{ outcome: { outcome: 'cancelled' } });
          turn.onEvent({ type: 'request-resolved', requestId: approval.request.id });
        }
        turn.approvals.clear();
      }
    }
    // A prompt response can precede a queued prompt or leave unresolved tools.
    if(turn.pending&&!queued)await bounded(turn.settled, 5000).catch(() => {});
    const client=this.client;
    const ref=this.executionRef(turn.executionId);
    if(client){
      const ended=!turn.pending&&['idle','stopped'].includes(turn.status)&&[...turn.tools.values()].every(tool=>tool.status==='completed');
      const released=!queued&&await client.released(ref,turn.contextId,this.bindingIdentity,ended);
      if(released){turn.stopConfirmed=true;turn.status='stopped';}
      else if(await client.stopExecution(ref,turn.contextId,this.bindingIdentity)){
        // The owned group has exited; tool *results* without receipts remain unknown.
        await client.close();
        await bounded(turn.settled,1000).catch(()=>{});
        turn.stopConfirmed=true;turn.status='stopped';
        for(const tool of turn.tools.values())if(tool.status!=='completed')tool.status=turn.independentTools.has(tool.id)?'unknown':'completed';
        for(const item of turn.items.values())if(item.kind==='tool'&&item.status==='running')this.item(turn,{...item,status:'unknown'});
        turn.diagnostic='本轮所属执行资源已确认退出；缺少完成回执的操作结果仍未知，不会重发。';
      }
    }
    if(turn.stopConfirmed){
      this.finishText(turn,'unknown');
      turn.onEvent({type:'observation',observation:this.observation()});
    }
    return this.observation();
  }
  async canRelease(input:{contextRef:ContextRef;executionRef:{id:string}}):Promise<boolean|{executionState:'unknown'}> {
    const turn=this.exactTurn(input.contextRef,input.executionRef);
    if(!turn||turn.pending||!['idle','stopped'].includes(turn.status))return false;
    const released=await this.client?.released(this.executionRef(turn.executionId),turn.contextId,this.bindingIdentity,true);
    if(!released)return false;
    return [...turn.tools.values()].every(tool=>tool.status==='completed')?true:{executionState:'unknown'};
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
  if (typeof answer === 'string') {
    // The shared web approval buttons submit the exact option id as a string.
    const option = options.find(option => option.optionId === answer)
      ?? (['approve', 'accept', 'allow-once'].includes(answer) ? options.find(option => option.kind === 'allow_once') : undefined)
      ?? (['deny', 'decline'].includes(answer) ? options.find(option => option.kind === 'reject_once') : undefined);
    if (!option || typeof option.optionId !== 'string') throw new Error('qoder_cn_permission_option_invalid');
    return { outcome: { outcome: 'selected', optionId: option.optionId } };
  }
  const value = answer && typeof answer === 'object' ? answer as Record<string, unknown> : {};
  if (value.selected !== undefined) {
    const index = typeof value.selected === 'number' ? value.selected : NaN;
    const option = options.find(item => item.optionId === value.selected) ?? (Number.isInteger(index) ? options[index] : undefined);
    if (option && typeof option.optionId === 'string') return { outcome: { outcome: 'selected', optionId: option.optionId } };
    throw new Error('qoder_cn_permission_option_invalid');
  }
  if (typeof value.optionId === 'string') {
    if (!options.some(option => option.optionId === value.optionId)) throw new Error('qoder_cn_permission_option_invalid');
    return { outcome: { outcome: 'selected', optionId: value.optionId } };
  }
  // A generic "approve once" must never select a persistent grant.
  const allow = options.find(option => option.kind === 'allow_once');
  if (value.approved === true && allow && typeof allow.optionId === 'string') return { outcome: { outcome: 'selected', optionId: allow.optionId } };
  return { outcome: { outcome: 'cancelled' } };
}
function allowedOutcome(options: Array<Record<string, unknown>>, outcome: unknown): boolean {
  const value = outcome && typeof outcome === 'object' ? (outcome as { outcome?: { outcome?: unknown; optionId?: unknown } }).outcome : undefined;
  if (!value || value.outcome !== 'selected' || typeof value.optionId !== 'string') return false;
  const option = options.find(item => item.optionId === value.optionId);
  return typeof option?.kind === 'string' && option.kind.startsWith('allow');
}
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(textOf).join('');
  if (content && typeof content === 'object') {
    const part = content as Record<string, unknown>;
    if (typeof part.text === 'string') return part.text;
    if (part.type === 'content') return textOf(part.content);
  }
  return '';
}
function previewOf(content: unknown): string {
  try { return typeof content === 'string' ? content : JSON.stringify(content ?? '').slice(0, 4000); } catch { return ''; }
}
function messageOf(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback; }
/** A missing native session is recoverable by creating a new one; anything else is a real failure. */
function resumeUnavailable(error: unknown): boolean {
  const code = error && typeof error === 'object' ? (error as { acpCode?: unknown }).acpCode : undefined;
  if (code === -32601 || code === -32602) return true;
  return /invalid session identifier|session (?:not found|unknown)|unknown session|no such session/i.test(messageOf(error, ''));
}
/** The CN gateway reports a missing or spent plan as 402/403 carrying a pricing link. */
function quotaMessage(message: string): string {
  const quota = /pricingUrl|\/pricing/i.test(message) || /quota|credit/i.test(message) && /\((?:402|403)\)|\b(?:402|403)\b/.test(message);
  return quota ? 'Qoder CN 当前账号套餐额度不足或没有可用套餐，请更换可用账号或购买套餐后继续。' : message;
}

export function createQoderCnExecutor(): AgentExecutor {
  return {
    nativeContent: createQoderNativeContent('qoder-cn'),
    readReleasedControl: input => releasedNativeControl('qoder-cn',input),
    readPersistedExecution: input => readQoderCnPersistedExecution(input),
    readSupplementReceipt: input => readQoderCnSupplementReceipt(input),
    storage: qoderStorage(),
    descriptor: qoderExecutorDescriptor('qoder-cn'),
    open: options => QoderCnRuntime.open(options),
  };
}
