import { antigravityModelVariant } from '../../domain/antigravity-model.ts';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import type {
  AccountObservation,
  AgentCapabilities,
  AgentExecutor,
  AgentModel,
  AgentRuntime,
  ContextRef,
  ExecutionFault,
  ExecutionRef,
  ExecutorDescriptor,
  ExecutorEvent,
  ExecutorImage,
  ExecutorItem,
  ExecutorNativeSource,
  ExecutorObservation,
  ExecutorOpenOptions,
  ExecutorRequest,
  ExecutorSendInput,
  LoginObservation,
  PermissionMode,
} from '../../contracts.ts';
import { ExecutorInputRejected, ExecutorObservationLost } from '../../contracts.ts';
import { AgentServiceError } from '../../domain/agent-state.ts';
import { interactionPolicy } from '../../domain/interaction-policy.ts';
import { instructionParticipation } from '../../domain/participation.ts';
import type { ModelQuotaObservation } from '../../model-access/contracts.ts';
import { ExecutorEventStream } from '../event-stream.ts';
import {
  bounded,
  executableIdentity,
  findExecutable,
  inspectVersion,
  isolatedEnvironment,
  nativeBinding,
  nativeHome,
  opaqueReference,
  parseReference,
  privateDirectories,
  releasedNativeControl,
} from '../native-process.ts';
import { AntigravityAcpClient, type AntigravityAcpServerRequest } from './acp.ts';
import {
  antigravityNativeContent,
  antigravityNativeTranscriptPath,
  readAntigravityCommandExits,
  antigravitySessionRecordPath,
  appendAntigravitySessionRow,
  isValidAntigravityContextId,
  readAntigravityPersistedExecution,
  readAppendOnlyJsonlDelta,
  readImmutableJsonlFile,
  reconcileAntigravityFinalText,
} from './content.ts';
import {
  acquireAntigravityCoordinator,
  parseHandshakeCapabilities,
  type AntigravityAccountProbeResult,
  type AntigravityCoordinator,
  type ConversationProcessHandle,
} from './coordinator.ts';
import {
  extractAntigravityText,
  extractAntigravityToolOutput,
  mapAntigravityToolName,
  mergeAntigravityToolInput,
} from './events.ts';
import {
  antigravityForm,
  antigravityPermissionOptions,
  antigravityPermissionOutcome,
} from './forms.ts';
import { ensureAntigravityAutoUpdateDisabled } from './program.ts';
import { antigravityStorage } from './storage.ts';

const PROVIDER = 'antigravity';
const NATIVE_SOURCE_ID = 'native-antigravity';
const EXCLUSIVE_REASON = '受 Google 官方授权限制，Google 个人账号仅可在 Antigravity 中使用。';
const PROGRESS_LANGUAGE_INSTRUCTION =
  '面向用户的进展说明使用简体中文，包括调用工具前、工具返回后和连续工具调用之间说明当前进展或下一步。引用命令、代码、路径、标识符、错误消息或工具输出时保留原文。';
const STOP_CANCEL_GRACE_MS = 1_200;

const capabilities: AgentCapabilities = {
  interaction: { policy: interactionPolicy.version, nonBlockingQuestions: false },
  supplement: false,
  endQuestionWait: false,
  permissionModes: ['default', 'full-access'],
  text: true,
  images: true,
  maxImageBytes: 8 * 1024 * 1024,
  approval: true,
  questions: true,
  stop: true,
  resume: true,
  maxInputBytes: 64 * 1024,
};

export const antigravityExecutorDescriptor: ExecutorDescriptor = {
  id: PROVIDER,
  label: 'Antigravity',
  capabilities,
  modelPolicy: {
    account: 'native',
    native: {
      sourceProviders: [NATIVE_SOURCE_ID],
      legacyModelVariant: antigravityModelVariant,
      useRequestedModelPerTurn: true,
      exclusive: true,
      exclusiveReason: EXCLUSIVE_REASON,
      binding: 'account-identity',
      defaultSourceAccountId: NATIVE_SOURCE_ID,
      readySourceSupersedesConnection: true,
      observeViaModelAccount: NATIVE_SOURCE_ID,
    },
  },
  runtimeTraits: {
    upgradeVerification: 'runtime',
    transientAccountProbe: true,
    hostKeyringAuth: true,
  },
};

export function composeAntigravityPolicyInstructions(baseInstructions = interactionPolicy.instructions): string {
  return `${baseInstructions}\n${PROGRESS_LANGUAGE_INSTRUCTION}`;
}

export function antigravityPolicyDigest(baseInstructions = interactionPolicy.instructions): string {
  return `sha256-${createHash('sha256').update(baseInstructions).digest('hex')}`;
}

interface PendingTurnRequest {
  request: ExecutorRequest;
  parentToolId?: string;
  resolveAnswer(answer: unknown): { rpcResult: unknown; approvedTool?: boolean };
  settleRpc(result: unknown): void;
  cancelValue(): unknown;
}

interface TurnState {
  contextId: string;
  cwd: string;
  executionId: string;
  executionRef: ExecutionRef;
  stream: ExecutorEventStream;
  items: Map<string, ExecutorItem>;
  tools: Map<string, { id: string; label: string; status: 'running' | 'completed' | 'unknown' }>;
  requests: Map<string, PendingTurnRequest>;
  status: ExecutorObservation['status'];
  fault?: ExecutionFault;
  diagnostic?: string;
  backgroundWork: boolean;
  startedAt: number;
  commandInputs: Map<string, string>;
  backgroundTimer?: ReturnType<typeof setInterval>;
  textSegment?: { id: string; kind: 'message' | 'thinking'; nativeId?: string };
  segmentCounter: number;
  lastMessage?: { id: string; superseded: boolean };
  pending: boolean;
  cancelRequested: boolean;
  stopConfirmed: boolean;
  stopReason?: string;
  stopping?: Promise<ExecutorObservation>;
  settled: Promise<void>;
  markSettled(): void;
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function resumeUnavailable(error: unknown): boolean {
  const code = error && typeof error === 'object' ? (error as { acpCode?: unknown }).acpCode : undefined;
  if (code === -32601 || code === -32602) return true;
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /invalid session identifier|session (?:not found|unknown)|unknown session|no such session/i.test(msg);
}

function findConfigOption(payload: any, configId: string): { currentValue?: string; values: string[] } | undefined {
  const list = Array.isArray(payload?.configOptions) ? payload.configOptions : [];
  const opt = list.find((entry: any) => entry && entry.id === configId);
  if (!opt) return undefined;
  const rawOptions = Array.isArray(opt.options)
    ? opt.options.flatMap((entry: any) => (entry && Array.isArray(entry.options) ? entry.options : [entry]))
    : [];
  const values = rawOptions
    .map((entry: any) => (entry && typeof entry.value === 'string' ? entry.value : undefined))
    .filter((v: string | undefined): v is string => Boolean(v));
  return {
    currentValue: typeof opt.currentValue === 'string' ? opt.currentValue : undefined,
    values,
  };
}

function formatPlanNotice(entries: unknown): string {
  if (!Array.isArray(entries) || !entries.length) return '';
  const lines: string[] = [];
  for (const item of entries) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const content = typeof rec.content === 'string' ? rec.content.trim() : '';
    if (!content) continue;
    const status = typeof rec.status === 'string' ? rec.status : 'pending';
    const marker = status === 'completed' ? '[已完成]' : status === 'in_progress' ? '[进行中]' : '[待执行]';
    lines.push(`${marker} ${content}`);
  }
  return lines.join('\n');
}

function stopReasonDiagnostic(stopReason: string): string {
  if (stopReason === 'max_tokens') return 'Antigravity 达到单轮最大输出上限而停止。';
  if (stopReason === 'max_turn_requests') return 'Antigravity 达到单轮最大工具请求上限而停止。';
  if (stopReason === 'refusal') return '模型因安全或策略限制拒绝完成本轮请求。';
  return `Antigravity 本轮提前结束（原因：${stopReason}）。`;
}

function matchesAntigravityAccountIdentity(liveIdentity: string, expected: string): boolean {
  if (liveIdentity === expected) return true;
  return createHash('sha256').update(liveIdentity).digest('hex') === expected;
}

function validatePermissionMode(mode: PermissionMode | undefined): PermissionMode {
  if (mode === undefined || mode === 'default') return 'default';
  if (mode === 'full-access') return 'full-access';
  throw new AgentServiceError('agent_permission_invalid', `不支持的权限模式：${String(mode)}`, 400);
}

export interface AntigravityAccountInspectorRuntime extends AgentRuntime {
  probeAccountRaw(options?: { forceFresh?: boolean }): Promise<AntigravityAccountProbeResult>;
  logoutAccount(): Promise<void>;
}

export class AntigravityRuntime implements AntigravityAccountInspectorRuntime {
  readonly capabilities: AgentCapabilities;
  readonly bindingIdentity: string;
  bindingData?: Record<string, unknown>;
  participationInstruction?: import('../../participation-contracts.ts').ParticipationMatch;

  private closedFlag = false;
  private readonly configRoot: string;
  private readonly coordinator: AntigravityCoordinator;
  private readonly nativeSource?: ExecutorNativeSource;
  private readonly composedInstructions: string;
  private readonly policyDigest: string;
  private readonly diagnostics?: ExecutorOpenOptions['diagnostics'];
  private readonly turns = new Map<string, TurnState>();
  private readonly releaseProofs = new Set<string>();

  private constructor(init: {
    bindingIdentity: string;
    bindingData: Record<string, unknown>;
    capabilities: AgentCapabilities;
    configRoot: string;
    coordinator: AntigravityCoordinator;
    nativeSource?: ExecutorNativeSource;
    composedInstructions: string;
    policyDigest: string;
    supportsSystemPromptAppend: boolean;
    diagnostics?: ExecutorOpenOptions['diagnostics'];
  }) {
    this.bindingIdentity = init.bindingIdentity;
    this.bindingData = init.bindingData;
    this.capabilities = init.capabilities;
    this.configRoot = init.configRoot;
    this.coordinator = init.coordinator;
    this.nativeSource = init.nativeSource;
    this.composedInstructions = init.composedInstructions;
    this.policyDigest = init.policyDigest;
    this.diagnostics = init.diagnostics;
    if (init.supportsSystemPromptAppend) {
      this.participationInstruction = instructionParticipation('interaction-policy', init.composedInstructions);
    }
  }

  get closed(): boolean {
    return this.closedFlag;
  }

  static async open(options: ExecutorOpenOptions): Promise<AntigravityRuntime> {
    if (options.gateway) {
      throw new AgentServiceError(
        'agent_gateway_unsupported',
        'Antigravity 只使用官方 Google 个人账号原生执行，不支持通过模型网关转发。',
        409,
      );
    }
    if (options.nativeSource && options.nativeSource.accountId !== NATIVE_SOURCE_ID) {
      throw new AgentServiceError(
        'agent_model_source_unsupported',
        'Antigravity 只支持 Google 个人账号来源。',
        409,
      );
    }

    const { home, temporary } = nativeHome(options.configRoot);
    await privateDirectories(options.configRoot, home, temporary);
    await ensureAntigravityAutoUpdateDisabled(options.configRoot);

    const env = isolatedEnvironment(
      options.environment,
      home,
      temporary,
      { SSH_CONNECTION: '1' },
      options.cacheRoot,
      { credentialScope: 'host-keyring' },
    );

    // Never scan user PATH for unmanaged `agy`: require an explicit bound executable path.
    const executable = await findExecutable(options.executable, [], {});
    const exeDigest = await executableIdentity(executable);

    if (options.binding?.data?.executableDigest && !options.programSource) {
      const priorExe = options.binding.executable
        ? await realpath(options.binding.executable).catch(() => undefined)
        : undefined;
      if ((!priorExe || priorExe === executable) && options.binding.data.executableDigest !== exeDigest) {
        throw new Error('agent_context_binding_mismatch');
      }
    }

    const version = await inspectVersion(executable, env, options.signal);
    const binding = await nativeBinding(
      PROVIDER,
      executable,
      version,
      options.configRoot,
      options.binding,
      options.programSource,
    );
    const bindingData = { ...binding.data, executableDigest: exeDigest };

    const handshake = await AntigravityRuntime.verifyHandshake(executable, options.configRoot, env, options.diagnostics);
    if (!handshake.supportsSystemPromptAppend) {
      options.diagnostics?.({ event: 'antigravity-system-prompt-append-missing', version });
    }

    const coordinator = acquireAntigravityCoordinator({
      configRoot: options.configRoot,
      executable,
      expectedExecutableDigest: exeDigest,
      environment: options.environment,
      cacheRoot: options.cacheRoot,
      diagnostics: options.diagnostics,
    });

    const baseInstructions = (options.interaction ?? interactionPolicy).instructions;
    const runtimeCapabilities: AgentCapabilities = {
      ...capabilities,
      images: handshake.image,
    };

    return new AntigravityRuntime({
      bindingIdentity: binding.identity,
      bindingData,
      capabilities: runtimeCapabilities,
      configRoot: options.configRoot,
      coordinator,
      nativeSource: options.nativeSource,
      composedInstructions: composeAntigravityPolicyInstructions(baseInstructions),
      policyDigest: antigravityPolicyDigest(baseInstructions),
      supportsSystemPromptAppend: handshake.supportsSystemPromptAppend,
      diagnostics: options.diagnostics,
    });
  }

  private static async verifyHandshake(
    executable: string,
    cwd: string,
    env: NodeJS.ProcessEnv,
    diagnostics?: ExecutorOpenOptions['diagnostics'],
  ) {
    const client = AntigravityAcpClient.open({
      executable,
      args: ['acp'],
      cwd,
      environment: env,
      diagnostics,
    });
    try {
      const initResult = await client.request(
        'initialize',
        { protocolVersion: 1, clientCapabilities: { elicitation: { form: {} } } },
        20_000,
      );
      const parsed = parseHandshakeCapabilities(initResult);
      if (!initResult?.agentCapabilities?.promptCapabilities && !initResult?.agentCapabilities?.prompt_capabilities) {
        throw new AgentServiceError(
          'agent_protocol_capability_missing',
          'Antigravity 程序缺少对话提示能力（promptCapabilities），无法建立连接。',
          409,
        );
      }
      if (!parsed.supportsResume) {
        throw new AgentServiceError(
          'agent_protocol_capability_missing',
          'Antigravity 程序缺少会话恢复能力（session/resume），无法保障上下文恢复契约。',
          409,
        );
      }
      return parsed;
    } finally {
      await client.close();
    }
  }

  async probeAccountRaw(options?: { forceFresh?: boolean }): Promise<AntigravityAccountProbeResult> {
    return this.coordinator.probeAccount(options);
  }

  async inspectModelSource(options?: { forceFresh?: boolean }) {
    const probe = await this.coordinator.probeAccount({ forceFresh: options?.forceFresh ?? true });
    return {
      status: probe.status,
      ...(probe.accountIdentity ? { accountIdentity: probe.accountIdentity } : {}),
      explicitAccountIdentity: probe.explicitAccountIdentity,
      ...(probe.identityUnconfirmed ? { identityUnconfirmed: true } : {}),
      ...(probe.accountLabel ? { accountLabel: probe.accountLabel } : {}),
      models: probe.models.map(item => ({
        id: item.id,
        label: item.label,
        images: item.images ?? true,
        tools: item.tools ?? true,
        ...(item.reasoningEfforts ? { reasoningEfforts: item.reasoningEfforts } : {}),
        ...(item.defaultReasoningEffort ? { defaultReasoningEffort: item.defaultReasoningEffort } : {}),
      })),
      quota: probe.quota,
      ...(probe.diagnostic ? { diagnostic: probe.diagnostic } : {}),
    };
  }

  async inspectAccount(): Promise<AccountObservation> {
    const probe = await this.coordinator.probeAccount({ forceFresh: true });
    return {
      status: probe.status,
      ...(probe.accountLabel ? { label: probe.accountLabel } : {}),
      loginMethod: 'Google 个人账号（Antigravity 官方登录）',
      ...(probe.diagnostic ? { diagnostic: probe.diagnostic } : {}),
    };
  }

  async models(): Promise<AgentModel[]> {
    if (this.nativeSource) return [this.nativeSource.model];
    const probe = await this.coordinator.probeAccount();
    if (probe.status !== 'ready') return [];
    return probe.models.map(({ id, label, isDefault, reasoningEfforts, defaultReasoningEffort }) => ({
      id,
      label,
      ...(isDefault !== undefined ? { isDefault } : {}),
      ...(reasoningEfforts ? { reasoningEfforts } : {}),
      ...(defaultReasoningEffort ? { defaultReasoningEffort } : {}),
    }));
  }

  async modelIdentity(): Promise<string> {
    if (this.nativeSource?.accountIdentity) return this.nativeSource.accountIdentity;
    const probe = await this.coordinator.probeAccount();
    if (probe.status !== 'ready' || !probe.accountIdentity) {
      throw new AgentServiceError('agent_account_unauthenticated', probe.diagnostic ?? 'Google 个人账号尚未就绪。', 409);
    }
    return probe.accountIdentity;
  }

  async modelQuota(): Promise<ModelQuotaObservation> {
    const probe = await this.coordinator.probeAccount();
    return probe.quota;
  }

  async beginLogin(onUpdate: (observation: LoginObservation) => void): Promise<void> {
    await this.coordinator.beginLogin(onUpdate);
  }

  async cancelLogin(): Promise<void> {
    await this.coordinator.cancelLogin();
  }

  async logoutAccount(): Promise<void> {
    await this.coordinator.logoutAccount();
  }

  async verifyUpgrade(): Promise<void> {
    await this.coordinator.verifyExecutableUnchanged();
  }

  private async verifyLiveAccountIdentity(boundIdentity?: string): Promise<AntigravityAccountProbeResult> {
    const probe = await this.coordinator.probeAccount();
    if (probe.status !== 'ready' || !probe.accountIdentity || probe.identityUnconfirmed) {
      throw new AgentServiceError(
        'agent_model_source_changed',
        probe.diagnostic ?? '当前 Google 账号登录已失效或身份无法确认，请重新登录或重新选择模型。',
        409,
      );
    }
    const expectedIdentity = boundIdentity ?? this.nativeSource?.accountIdentity;
    if (expectedIdentity && !matchesAntigravityAccountIdentity(probe.accountIdentity, expectedIdentity)) {
      throw new AgentServiceError(
        'agent_model_source_changed',
        '检测到 Google 账号已变化，旧对话不会在其他账号下继续执行；请重新选择模型。',
        409,
      );
    }
    if (this.nativeSource?.accountIdentity && !matchesAntigravityAccountIdentity(probe.accountIdentity, this.nativeSource.accountIdentity)) {
      throw new AgentServiceError(
        'agent_model_source_changed',
        '检测到 Google 账号已变化，旧对话不会在其他账号下继续执行；请重新选择模型。',
        409,
      );
    }
    return probe;
  }

  async createContext(input: { cwd: string; permissionMode?: PermissionMode }): Promise<ContextRef> {
    if (this.closedFlag) throw new AgentServiceError('agent_runtime_closed', 'Antigravity 运行时已关闭。', 409);
    const mode = validatePermissionMode(input.permissionMode);
    const probe = await this.verifyLiveAccountIdentity();
    const provisionalId = `provisional-${randomUUID()}`;
    const handle = await this.coordinator.acquireConversationProcess({
      contextId: provisionalId,
      permissionMode: mode,
      accountIdentity: probe.accountIdentity!,
      cwd: input.cwd,
      owner: this,
    });
    try {
      const params: Record<string, unknown> = {
        cwd: input.cwd,
        mcpServers: [],
        ...(handle.handshake.supportsSystemPromptAppend
          ? { _meta: { antigravity: { systemPrompt: { append: this.composedInstructions } } } }
          : {}),
      };
      const created = await handle.client.request('session/new', params, 30_000);
      const sessionId = typeof created?.sessionId === 'string' ? created.sessionId : '';
      if (!isValidAntigravityContextId(sessionId)) {
        throw new AgentServiceError('agent_protocol_invalid', 'Antigravity 返回了无效的原生会话标识。', 502);
      }
      const adopted = this.coordinator.adoptProvisionalProcess(provisionalId, sessionId) ?? handle;
      adopted.loadedSessionId = sessionId;
      adopted.appliedPolicyDigest = adopted.handshake.supportsSystemPromptAppend ? this.policyDigest : undefined;
      adopted.sessionPayload = created;

      if (!adopted.handshake.supportsSystemPromptAppend) {
        this.participationInstruction = undefined;
        this.diagnostics?.({ event: 'antigravity-policy-append-unsupported', contextId: sessionId });
      } else {
        this.participationInstruction = instructionParticipation('interaction-policy', this.composedInstructions);
      }

      if (mode === 'default' && created?.modes?.currentModeId && created.modes.currentModeId !== 'default') {
        await this.ensureDefaultSessionMode(adopted, sessionId);
      }

      return {
        id: sessionId,
        data: {
          cwd: input.cwd,
          native: opaqueReference(PROVIDER, sessionId, input.cwd, this.bindingIdentity),
          policyDigest: this.policyDigest,
          supportsResumePolicyUpdate: adopted.handshake.supportsSystemPromptAppend,
          accountIdentity: probe.accountIdentity,
        },
      };
    } catch (error) {
      await this.coordinator.closeConversationProcess(provisionalId);
      throw error;
    }
  }

  async resumeContext(input: { contextRef: ContextRef; cwd: string; permissionMode?: PermissionMode }): Promise<void> {
    if (this.closedFlag) throw new AgentServiceError('agent_runtime_closed', 'Antigravity 运行时已关闭。', 409);
    const mode = validatePermissionMode(input.permissionMode);
    const parsed = parseReference(
      String(input.contextRef.data?.native ?? ''),
      PROVIDER,
      input.cwd,
      this.bindingIdentity,
    );
    if (parsed.nativeSessionId !== input.contextRef.id || !isValidAntigravityContextId(input.contextRef.id)) {
      throw new Error('agent_context_binding_mismatch');
    }

    const activeTurn = this.turns.get(input.contextRef.id);
    if (activeTurn?.pending) {
      throw new AgentServiceError('agent_execution_active', '当前 Antigravity 会话仍有未结束的执行。', 409);
    }

    const boundIdentity = typeof input.contextRef.data?.accountIdentity === 'string'
      ? input.contextRef.data.accountIdentity
      : undefined;
    const probe = await this.verifyLiveAccountIdentity(boundIdentity);

    const handle = await this.coordinator.acquireConversationProcess({
      contextId: input.contextRef.id,
      permissionMode: mode,
      accountIdentity: probe.accountIdentity!,
      cwd: input.cwd,
      owner: this,
    });

    const recordedDigest = typeof input.contextRef.data?.policyDigest === 'string'
      ? input.contextRef.data.policyDigest
      : undefined;
    if (recordedDigest && recordedDigest !== this.policyDigest && !handle.handshake.supportsSystemPromptAppend) {
      throw new AgentServiceError(
        'agent_context_policy_changed',
        '本轮将开启新的 Antigravity 会话；此前对话记录已保留。',
        409,
      );
    }

    const needsResumeCall =
      handle.loadedSessionId !== input.contextRef.id
      || (handle.handshake.supportsSystemPromptAppend && handle.appliedPolicyDigest !== this.policyDigest);

    if (needsResumeCall) {
      try {
        const resumed = await handle.client.request(
          'session/resume',
          {
            sessionId: input.contextRef.id,
            cwd: input.cwd,
            mcpServers: [],
            ...(handle.handshake.supportsSystemPromptAppend
              ? { _meta: { antigravity: { systemPrompt: { append: this.composedInstructions } } } }
              : {}),
          },
          30_000,
        );
        handle.loadedSessionId = input.contextRef.id;
        handle.appliedPolicyDigest = handle.handshake.supportsSystemPromptAppend ? this.policyDigest : recordedDigest;
        handle.sessionPayload = resumed;
        if (input.contextRef.data && handle.handshake.supportsSystemPromptAppend) {
          input.contextRef.data.policyDigest = this.policyDigest;
          input.contextRef.data.supportsResumePolicyUpdate = true;
        }
      } catch (error) {
        if (resumeUnavailable(error)) {
          throw new AgentServiceError('agent_context_unavailable', 'Antigravity 原生会话已不存在或不可恢复。', 409);
        }
        throw error;
      }
    }

    if (!handle.handshake.supportsSystemPromptAppend) {
      this.participationInstruction = undefined;
    } else {
      this.participationInstruction = instructionParticipation('interaction-policy', this.composedInstructions);
    }

    if (mode === 'default' && handle.sessionPayload?.modes?.currentModeId && handle.sessionPayload.modes.currentModeId !== 'default') {
      await this.ensureDefaultSessionMode(handle, input.contextRef.id);
    }
  }

  private async ensureDefaultSessionMode(handle: ConversationProcessHandle, sessionId: string): Promise<void> {
    let updated: any;
    try {
      updated = await handle.client.request('session/set_mode', { sessionId, modeId: 'default' }, 15_000);
    } catch {
      throw new ExecutorInputRejected('antigravity_permission_unavailable: Antigravity 切换回默认审批模式失败，已拒绝发送。');
    }
    const readback = updated?.modes?.currentModeId ?? findConfigOption(updated, 'mode')?.currentValue;
    if (readback !== 'default') {
      throw new ExecutorInputRejected('antigravity_permission_unavailable: Antigravity 默认审批模式回读不一致，已拒绝发送。');
    }
    this.mergeSessionConfig(handle, updated);
  }

  private mergeSessionConfig(handle: ConversationProcessHandle, update: any): void {
    const previous = handle.sessionPayload;
    handle.sessionPayload = { ...previous, ...update, models: { ...previous?.models, ...update?.models } };
    const model = findConfigOption(update, 'model')?.currentValue;
    if (model && !update?.models?.currentModelId) handle.sessionPayload.models.currentModelId = model;
  }

  private async applySeriesOptions(handle: ConversationProcessHandle, sessionId: string, model: string, depth: string | undefined): Promise<void> {
    for (const [configId, value] of [['model', model], ['thought_level', depth]] as const) {
      if (!value || findConfigOption(handle.sessionPayload, configId)?.currentValue === value) continue;
      let updated: any;
      try {
        updated = await handle.client.request('session/set_config_option', { sessionId, configId, value }, 15_000);
      } catch {
        throw new ExecutorInputRejected(`antigravity_model_unavailable: Antigravity 无法确认所选模型或深度 ${value}。`);
      }
      const payload = Array.isArray(updated) ? { configOptions: updated } : updated;
      if (findConfigOption(payload, configId)?.currentValue !== value) {
        throw new ExecutorInputRejected(`antigravity_model_unavailable: Antigravity 模型设置回读不一致（${configId}）。`);
      }
      this.mergeSessionConfig(handle, payload);
    }
  }

  private async applyModelAndEffort(
    handle: ConversationProcessHandle,
    sessionId: string,
    model?: string,
    reasoningEffort?: string,
  ): Promise<void> {
    if (model) {
      const probe = await this.verifyLiveAccountIdentity();
      const legacy = antigravityModelVariant(model);
      const series = probe.models.find(item => item.id === (legacy?.family ?? model));
      const depth = legacy?.depth ?? reasoningEffort ?? series?.defaultReasoningEffort;
      const variantId = `${series?.id}-${depth}`;
      const variant = antigravityModelVariant(variantId) ? variantId : model;
      if (!series || !probe.nativeModelIds?.includes(variant)) {
        throw new ExecutorInputRejected(`antigravity_model_unavailable: Antigravity 当前账号不支持模型 ${variant}。`);
      }
      if (findConfigOption(handle.sessionPayload, 'model')?.values.includes(series.id)
        && (antigravityModelVariant(variant) || !findConfigOption(handle.sessionPayload, 'thought_level')?.values.length || !series.reasoningEfforts?.length)) {
        await this.applySeriesOptions(handle, sessionId, series.id, antigravityModelVariant(variant) ? depth : undefined);
        return;
      }
      model = variant;
      if (antigravityModelVariant(variant)) reasoningEffort = undefined;
      if (handle.sessionPayload?.models?.currentModelId !== model) {
        let updated: any;
        try {
          updated = await handle.client.request('session/set_model', { sessionId, modelId: model }, 15_000);
        } catch (error) {
          const msg = error instanceof Error ? error.message : '模型不受支持';
          throw new ExecutorInputRejected(`antigravity_model_unavailable: Antigravity 设置模型失败：${msg}`);
        }
        const readback = updated?.models?.currentModelId ?? findConfigOption(updated, 'model')?.currentValue;
        if (readback !== model) {
          throw new ExecutorInputRejected(`antigravity_model_unavailable: Antigravity 模型回读不一致（期望 ${model}，实际 ${String(readback ?? '未知')}），已拒绝发送。`);
        }
        this.mergeSessionConfig(handle, updated);
      }
    }

    if (reasoningEffort) {
      const thoughtOption = findConfigOption(handle.sessionPayload, 'thought_level');
      if (!thoughtOption || (thoughtOption.values.length > 0 && !thoughtOption.values.includes(reasoningEffort))) {
        throw new ExecutorInputRejected(`antigravity_reasoning_unavailable: Antigravity 当前模型不支持思考深度 ${reasoningEffort}。`);
      }
      if (thoughtOption.currentValue !== reasoningEffort) {
        let updated: any;
        try {
          updated = await handle.client.request(
            'session/set_config_option',
            { sessionId, configId: 'thought_level', value: reasoningEffort },
            15_000,
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : '思考深度不受支持';
          throw new ExecutorInputRejected(`antigravity_reasoning_unavailable: Antigravity 设置思考深度失败：${msg}`);
        }
        const readback = findConfigOption(updated, 'thought_level')?.currentValue;
        if (readback !== reasoningEffort) {
          throw new ExecutorInputRejected(
            `antigravity_reasoning_unavailable: Antigravity 思考深度回读不一致（期望 ${reasoningEffort}，实际 ${String(readback ?? '未知')}），已拒绝发送。`,
          );
        }
        this.mergeSessionConfig(handle, updated);
      }
    }
  }

  async prepareContext(input: {
    contextRef: ContextRef;
    cwd: string;
    model?: string;
    reasoningEffort?: string;
    permissionMode?: PermissionMode;
  }): Promise<void> {
    await this.resumeContext({
      contextRef: input.contextRef,
      cwd: input.cwd,
      permissionMode: input.permissionMode,
    });
    const handle = this.coordinator.getConversationProcess(input.contextRef.id);
    if (!handle) {
      throw new ExecutorInputRejected('Antigravity 会话进程未就绪，请重试。');
    }
    await this.applyModelAndEffort(handle, input.contextRef.id, input.model, input.reasoningEffort);
  }

  private async preparePromptParts(
    text: string,
    images: ExecutorImage[],
    supportsImage: boolean,
  ): Promise<Array<Record<string, unknown>>> {
    if (!text.trim() && images.length === 0) {
      throw new ExecutorInputRejected('发送内容不能为空。');
    }
    if (Buffer.byteLength(text, 'utf8') > this.capabilities.maxInputBytes) {
      throw new ExecutorInputRejected('输入文本超出 Antigravity 单轮容量上限。');
    }
    if (images.length > 0) {
      if (!supportsImage || !this.capabilities.images) {
        throw new ExecutorInputRejected('当前 Antigravity 版本不支持图片输入。');
      }
      if (images.length > 9) {
        throw new ExecutorInputRejected('单次最多附带 9 张图片。');
      }
      const maxSingle = this.capabilities.maxImageBytes ?? 8 * 1024 * 1024;
      let totalBytes = 0;
      const imageParts: Array<Record<string, unknown>> = [];
      for (const img of images) {
        if (!/^image\/(?:png|jpeg|jpg|webp|gif)$/i.test(img.mimeType)) {
          throw new ExecutorInputRejected(`不支持的图片类型：${img.mimeType}`);
        }
        let bytes: Buffer;
        try {
          const stat = fs.statSync(img.path);
          if (!stat.isFile() || stat.size > maxSingle) {
            throw new ExecutorInputRejected(`图片大小超出 Antigravity 上限（${Math.round(maxSingle / (1024 * 1024))} MB）。`);
          }
          totalBytes += stat.size;
          if (totalBytes > 32 * 1024 * 1024) {
            throw new ExecutorInputRejected('单轮图片总大小超出 32 MB 上限。');
          }
          bytes = await readFile(img.path);
        } catch (error) {
          if (error instanceof ExecutorInputRejected) throw error;
          throw new ExecutorInputRejected('读取待发送图片失败，草稿已保留。');
        }
        if (bytes.byteLength > maxSingle) {
          throw new ExecutorInputRejected(`图片大小超出 Antigravity 上限（${Math.round(maxSingle / (1024 * 1024))} MB）。`);
        }
        imageParts.push({
          type: 'image',
          mimeType: img.mimeType,
          data: bytes.toString('base64'),
        });
      }
      return [{ type: 'text', text }, ...imageParts];
    }
    return [{ type: 'text', text }];
  }

  async send(input: ExecutorSendInput): Promise<void> {
    if (this.closedFlag) throw new ExecutorInputRejected('Antigravity 运行时已关闭。');
    let mode: PermissionMode;
    try {
      mode = validatePermissionMode(input.permissionMode);
    } catch (error) {
      throw new ExecutorInputRejected(error instanceof Error ? error.message : '权限模式无效。');
    }

    const existingTurn = this.turns.get(input.contextRef.id);
    if (existingTurn && (existingTurn.pending || existingTurn.backgroundWork)) {
      throw new ExecutorInputRejected('当前 Antigravity 会话仍有未结束的执行。');
    }

    try {
      await this.resumeContext({
        contextRef: input.contextRef,
        cwd: input.cwd,
        permissionMode: mode,
      });
    } catch (error) {
      if (error instanceof ExecutorInputRejected) throw error;
      if (error instanceof AgentServiceError && error.code === 'agent_model_source_changed') {
        throw Object.assign(new ExecutorInputRejected(`agent_model_source_changed: ${error.message}`), { code: error.code });
      }
      throw new ExecutorInputRejected(error instanceof Error ? error.message : 'Antigravity 会话校验未通过。');
    }

    const handle = this.coordinator.getConversationProcess(input.contextRef.id);
    if (!handle || handle.client.transportClosed) {
      throw new ExecutorInputRejected('Antigravity 会话进程未就绪，草稿已保留。');
    }

    const promptParts = await this.preparePromptParts(input.text, input.images, handle.handshake.image);
    await this.applyModelAndEffort(handle, input.contextRef.id, input.model, input.reasoningEffort);

    const contextId = input.contextRef.id;
    const executionId = randomUUID();
    const executionRef = handle.client.executionRef(executionId, contextId, this.bindingIdentity, false);
    const stream = new ExecutorEventStream(input.onEvent);
    const settledWait = deferred<void>();

    const turn: TurnState = {
      contextId,
      cwd: input.cwd,
      executionId,
      executionRef,
      stream,
      items: new Map(),
      tools: new Map(),
      requests: new Map(),
      status: 'running',
      backgroundWork: false,
      startedAt: Math.floor(Date.now() / 1000) * 1000,
      commandInputs: new Map(),
      segmentCounter: 0,
      pending: true,
      cancelRequested: false,
      stopConfirmed: false,
      settled: settledWait.promise,
      markSettled: () => settledWait.resolve(),
    };
    this.turns.set(contextId, turn);

    const nativeTranscriptFile = antigravityNativeTranscriptPath(this.configRoot, contextId);
    let initialTranscriptOffset = 0;
    try {
      if (fs.existsSync(nativeTranscriptFile)) {
        initialTranscriptOffset = fs.statSync(nativeTranscriptFile).size;
      }
    } catch {
      initialTranscriptOffset = 0;
    }

    const userItemId = `user:${executionId}`;
    appendAntigravitySessionRow(this.configRoot, contextId, {
      type: 'user',
      id: userItemId,
      clientRequestId: input.clientRequestId,
      cwd: input.cwd,
      text: input.text,
      ...(input.images.length > 0 ? { content: input.images.map(img => ({ type: 'image', path: img.path, mimeType: img.mimeType })) } : {}),
    });

    const userItem: ExecutorItem = {
      id: userItemId,
      clientRequestId: input.clientRequestId,
      kind: 'message',
      role: 'user',
      text: input.text,
      executionId,
      status: 'completed',
    };
    turn.items.set(userItem.id, userItem);
    stream.push({ type: 'accepted', executionRef, inputItemId: userItemId });
    stream.push({ type: 'item', item: userItem });
    stream.push({ type: 'observation', observation: this.buildObservation(turn) });

    let transportDisconnected = false;
    const fallbackCompletion = deferred<{ stopReason: string; finalText?: string; backgroundActive?: boolean }>();
    let fallbackTimer: ReturnType<typeof setInterval> | undefined;
    let fallbackGraceTimer: ReturnType<typeof setTimeout> | undefined;

    handle.setHandlers({
      onNotification: (method, params) => {
        if (method !== 'session/update' || params.sessionId !== contextId) return;
        const update = params.update as Record<string, unknown> | undefined;
        if (!turn.pending && !(turn.backgroundWork && update?.sessionUpdate === 'tool_call_update'
          && typeof update.toolCallId === 'string' && turn.tools.get(update.toolCallId)?.status === 'running')) return;
        this.handleTurnUpdate(turn, handle, update);
        if (turn.backgroundWork && !turn.pending && turn.stopReason === 'end_turn'
          && [...turn.tools.values()].every(tool => tool.status === 'completed')) {
          this.finishBackgroundTurn(turn, handle);
        }
      },
      onServerRequest: request => this.handleServerRequest(turn, request),
      onExit: () => {
        if (!turn.pending && !turn.backgroundWork) return;
        this.clearBackgroundTracking(turn);
        if (turn.cancelRequested || turn.stopConfirmed) {
          turn.pending = false;
          turn.markSettled();
          return;
        }
        transportDisconnected = true;
        this.closeTextSegment(turn, 'unknown');
        for (const [id, tool] of turn.tools) {
          if (tool.status === 'running') {
            turn.tools.set(id, { ...tool, status: 'unknown' });
          }
        }
        for (const [, item] of turn.items) {
          if (item.kind === 'tool' && item.status === 'running') {
            this.emitItem(turn, { ...item, status: 'unknown' });
          }
        }
        for (const [, req] of turn.requests) {
          req.settleRpc(req.cancelValue());
          turn.stream.push({ type: 'request-resolved', requestId: req.request.id });
        }
        turn.requests.clear();
        turn.status = 'unknown';
        turn.fault = { kind: 'transport' };
        turn.diagnostic = 'Antigravity 进程意外中断，已保留当前未知状态且不会自动重放。';
        turn.pending = false;
        turn.stream.flush();
        turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
        turn.markSettled();
        if (!turn.stopReason) fallbackCompletion.reject(new ExecutorObservationLost('execution'));
      },
    });

    let scanOffset = initialTranscriptOffset;
    fallbackTimer = setInterval(() => {
      if (!turn.pending || fallbackGraceTimer) return;
      const delta = readAppendOnlyJsonlDelta(nativeTranscriptFile, scanOffset);
      if (!delta) return;
      scanOffset = delta.offset;
      const completedRow = delta.rows.findLast(
        row => row?.sessionId === contextId && row?.type === 'turn_complete' && typeof row.stopReason === 'string',
      );
      if (completedRow) {
        fallbackGraceTimer = setTimeout(() => {
          fallbackCompletion.resolve({
            stopReason: String(completedRow.stopReason),
            finalText: typeof completedRow.finalText === 'string' ? completedRow.finalText : undefined,
            backgroundActive: completedRow.backgroundActive === true,
          });
        }, 120);
        fallbackGraceTimer.unref?.();
      }
    }, 50);
    fallbackTimer.unref?.();

    try {
      const rpcPromise = handle.client
        .request('session/prompt', { sessionId: contextId, prompt: promptParts }, 0)
        .then(res => ({
          stopReason: typeof res?.stopReason === 'string' ? res.stopReason : 'end_turn',
          fromRpc: true,
        }));

      const outcome = await Promise.race([
        rpcPromise,
        fallbackCompletion.promise.then(res => ({ ...res, fromRpc: false })),
      ]);

      if (transportDisconnected) {
        throw new ExecutorObservationLost('execution');
      }

      if (turn.stopConfirmed) {
        turn.stream.flush();
        return;
      }

      turn.stream.flush();

      const fullDelta = readAppendOnlyJsonlDelta(nativeTranscriptFile, initialTranscriptOffset);
      const completedRow = fullDelta?.rows.findLast(
        row => row?.sessionId === contextId && row?.type === 'turn_complete',
      );
      const stopReason = outcome.stopReason || (typeof completedRow?.stopReason === 'string' ? completedRow.stopReason : 'end_turn');
      const authoritativeFinal = typeof completedRow?.finalText === 'string'
        ? completedRow.finalText
        : 'finalText' in outcome && typeof outcome.finalText === 'string'
          ? outcome.finalText
          : undefined;
      const pendingCommand = stopReason === 'end_turn' && [...turn.tools.values()].some(tool => tool.status === 'running' && tool.label === 'command');
      const backgroundActive = pendingCommand || completedRow?.backgroundActive === true
        || ('backgroundActive' in outcome && outcome.backgroundActive === true);

      turn.stopReason = stopReason;
      this.closeTextSegment(turn, 'completed');

      if (authoritativeFinal) {
        this.reconcileFinalAssistantText(turn, authoritativeFinal);
      }

      const latestAssistantText = [...turn.items.values()]
        .filter(item => item.kind === 'message' && item.role === 'assistant')
        .at(-1)?.text;

      appendAntigravitySessionRow(this.configRoot, contextId, {
        type: 'turn_complete',
        cwd: input.cwd,
        stopReason,
        ...(latestAssistantText ? { finalText: latestAssistantText } : {}),
        backgroundActive,
      });

      if (backgroundActive) {
        turn.backgroundWork = true;
        turn.pending = false;
        turn.status = 'running';
        turn.executionRef = handle.client.executionRef(executionId, contextId, this.bindingIdentity, true);
        turn.stream.flush();
        turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
        if (pendingCommand) {
          turn.backgroundTimer = setInterval(() => this.observeBackgroundCommands(turn, handle), 1000);
          turn.backgroundTimer.unref();
        }
        return;
      }

      const unsettledTools = [...turn.tools.values()].filter(t => t.status !== 'completed');
      if (unsettledTools.length > 0 && stopReason !== 'cancelled') {
        for (const tool of unsettledTools) {
          turn.tools.set(tool.id, { ...tool, status: 'unknown' });
          const existingItem = turn.items.get(tool.id);
          if (existingItem && existingItem.kind === 'tool') {
            this.emitItem(turn, { ...existingItem, status: 'unknown' });
          }
        }
        turn.pending = false;
        turn.status = 'unknown';
        turn.diagnostic = 'Antigravity 正文已结束，但仍有工具缺少完成回执；未报告为完整成功。';
        turn.stream.flush();
        turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
        return;
      }

      if (stopReason === 'cancelled') {
        for (const tool of unsettledTools) {
          turn.tools.set(tool.id, { ...tool, status: 'unknown' });
          const existingItem = turn.items.get(tool.id);
          if (existingItem && existingItem.kind === 'tool' && existingItem.status === 'running') {
            this.emitItem(turn, { ...existingItem, status: 'unknown' });
          }
        }
        turn.pending = false;
        turn.status = 'stopped';
        turn.stream.flush();
        turn.stream.push({ type: 'completed', status: 'stopped' });
        turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
        return;
      }

      if (stopReason !== 'end_turn') {
        const diag = stopReasonDiagnostic(stopReason);
        turn.pending = false;
        turn.status = 'stopped';
        turn.diagnostic = diag;
        turn.stream.flush();
        turn.stream.push({ type: 'completed', status: 'stopped', diagnostic: diag });
        turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
        return;
      }

      turn.pending = false;
      turn.status = 'idle';
      turn.stream.flush();
      turn.stream.push({ type: 'completed', status: 'completed' });
      turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
    } catch (error) {
      if (error instanceof ExecutorObservationLost || transportDisconnected) {
        throw error instanceof ExecutorObservationLost ? error : new ExecutorObservationLost('execution');
      }
      if (turn.stopConfirmed || turn.cancelRequested) {
        turn.pending = false;
        turn.status = 'stopped';
        turn.stream.flush();
        turn.stream.push({ type: 'completed', status: 'stopped' });
        turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
        return;
      }
      this.closeTextSegment(turn, 'unknown');
      turn.pending = false;
      turn.status = 'unknown';
      turn.fault = { kind: 'protocol' };
      turn.diagnostic = error instanceof Error ? error.message : 'Antigravity 执行中断。';
      turn.stream.flush();
      turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
      throw error;
    } finally {
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (fallbackGraceTimer) clearTimeout(fallbackGraceTimer);
      turn.pending = false;
      turn.markSettled();
    }
  }

  private clearBackgroundTracking(turn: TurnState): void {
    clearInterval(turn.backgroundTimer);
    turn.backgroundTimer = undefined;
    turn.backgroundWork = false;
  }

  private observeBackgroundCommands(turn: TurnState, handle: ConversationProcessHandle): void {
    if (!turn.backgroundWork || turn.cancelRequested || this.closedFlag) return;
    for (const exit of readAntigravityCommandExits(this.configRoot, turn.contextId, turn.startedAt)) {
      const matches = [...turn.commandInputs].filter(([, command]) => command === exit.command);
      if (matches.length !== 1) continue;
      const [id] = matches[0]!;
      if (turn.tools.get(id)?.status !== 'running') continue;
      this.handleTurnUpdate(turn, handle, {
        sessionUpdate: 'tool_call_update', toolCallId: id, status: exit.code === 0 ? 'completed' : 'failed',
        content: [{ type: 'content', content: { type: 'text', text: exit.result } }],
      });
    }
    if (turn.stopReason === 'end_turn' && [...turn.tools.values()].every(tool => tool.status === 'completed')) {
      this.finishBackgroundTurn(turn, handle);
    }
  }

  private finishBackgroundTurn(turn: TurnState, handle: ConversationProcessHandle): void {
    this.clearBackgroundTracking(turn);
    turn.status = 'idle';
    turn.executionRef = handle.client.executionRef(turn.executionId, turn.contextId, this.bindingIdentity, false);
    const finalText = [...turn.items.values()].findLast(item => item.kind === 'message' && item.role === 'assistant')?.text;
    appendAntigravitySessionRow(this.configRoot, turn.contextId, {
      type: 'turn_complete', cwd: turn.cwd, stopReason: 'end_turn', finalText, backgroundActive: false,
    });
    turn.stream.push({ type: 'completed', status: 'completed' });
    turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
  }

  private handleTurnUpdate(
    turn: TurnState,
    handle: ConversationProcessHandle,
    update: Record<string, unknown> | undefined,
  ): void {
    if (!update || typeof update.sessionUpdate !== 'string') return;
    const kind = update.sessionUpdate;

    if (kind === 'agent_message_chunk') {
      const chunk = extractAntigravityText(update.content);
      if (!chunk) return;
      const nativeId = typeof update.messageId === 'string' && update.messageId ? update.messageId : undefined;
      if (
        !turn.textSegment
        || turn.textSegment.kind !== 'message'
        || (nativeId && turn.textSegment.nativeId && turn.textSegment.nativeId !== nativeId)
      ) {
        if (turn.textSegment?.kind === 'message' && turn.lastMessage) {
          turn.lastMessage.superseded = true;
        }
        this.closeTextSegment(turn, 'completed');
        const id = `message:${turn.executionId}:${++turn.segmentCounter}`;
        turn.textSegment = { id, kind: 'message', nativeId };
        turn.lastMessage = { id, superseded: false };
      } else if (nativeId && !turn.textSegment.nativeId) {
        turn.textSegment.nativeId = nativeId;
      }
      const priorText = turn.items.get(turn.textSegment.id)?.text ?? '';
      const nextText = priorText + chunk;
      this.emitItem(turn, {
        id: turn.textSegment.id,
        kind: 'message',
        role: 'assistant',
        text: nextText,
        executionId: turn.executionId,
        status: 'running',
      });
      appendAntigravitySessionRow(this.configRoot, turn.contextId, {
        type: 'assistant_segment',
        id: turn.textSegment.id,
        cwd: turn.cwd,
        text: nextText,
      });
      return;
    }

    if (kind === 'agent_thought_chunk') {
      const chunk = extractAntigravityText(update.content);
      if (!chunk) return;
      if (turn.textSegment?.kind === 'message') {
        if (turn.lastMessage) turn.lastMessage.superseded = true;
        this.closeTextSegment(turn, 'completed');
      }
      const nativeId = typeof update.messageId === 'string' && update.messageId ? update.messageId : undefined;
      if (
        !turn.textSegment
        || turn.textSegment.kind !== 'thinking'
        || (nativeId && turn.textSegment.nativeId && turn.textSegment.nativeId !== nativeId)
      ) {
        this.closeTextSegment(turn, 'completed');
        const id = `thinking:${turn.executionId}:${++turn.segmentCounter}`;
        turn.textSegment = { id, kind: 'thinking', nativeId };
      }
      const priorText = turn.items.get(turn.textSegment.id)?.text ?? '';
      this.emitItem(turn, {
        id: turn.textSegment.id,
        kind: 'thinking',
        role: 'assistant',
        thinking: true,
        text: priorText + chunk,
        executionId: turn.executionId,
        status: 'running',
      });
      return;
    }

    if (kind === 'tool_call' || kind === 'tool_call_update') {
      const toolId = typeof update.toolCallId === 'string' ? update.toolCallId.trim() : '';
      if (!toolId) return;
      if (turn.lastMessage) turn.lastMessage.superseded = true;
      this.closeTextSegment(turn, 'completed');

      const priorItem = turn.items.get(toolId);
      const priorTerminal = priorItem?.status === 'completed' || priorItem?.status === 'failed';
      const output = extractAntigravityToolOutput(update.content);
      const name = mapAntigravityToolName(update.kind, update.title, output.hasDiff, priorItem?.name);
      const mergedInput = mergeAntigravityToolInput(update.rawInput, update.locations, priorItem?.input);

      const commandLine = mergedInput.objectInput?.CommandLine;
      if (name === 'command' && typeof commandLine === 'string') turn.commandInputs.set(toolId, commandLine);

      const rawStatus = typeof update.status === 'string' ? update.status.toLowerCase() : '';
      let itemStatus: NonNullable<ExecutorItem['status']>;
      if (rawStatus === 'completed') itemStatus = 'completed';
      else if (rawStatus === 'failed' || rawStatus === 'error' || rawStatus === 'rejected') itemStatus = 'failed';
      else if (priorTerminal) itemStatus = priorItem!.status!;
      else itemStatus = 'running';

      const nextItem: ExecutorItem = {
        id: toolId,
        kind: 'tool',
        role: 'assistant',
        name,
        ...(mergedInput.previewInput !== undefined ? { input: mergedInput.previewInput } : {}),
        text: output.previewText || priorItem?.text || '',
        nativeTool: true,
        executionId: turn.executionId,
        status: itemStatus,
      };
      this.emitItem(turn, nextItem);

      const obsStatus: 'running' | 'completed' = itemStatus === 'running' ? 'running' : 'completed';
      turn.tools.set(toolId, { id: toolId, label: name, status: obsStatus });

      if (kind === 'tool_call' || mergedInput.fullInput !== undefined) {
        appendAntigravitySessionRow(this.configRoot, turn.contextId, {
          type: 'tool_call',
          toolCallId: toolId,
          cwd: turn.cwd,
          name,
          ...(mergedInput.objectInput ? { input: mergedInput.objectInput } : {}),
          ...(mergedInput.fullInput !== undefined ? { fullInput: mergedInput.fullInput } : {}),
          status: itemStatus,
        });
      }
      if (itemStatus === 'completed' || itemStatus === 'failed' || output.fullText) {
        appendAntigravitySessionRow(this.configRoot, turn.contextId, {
          type: 'tool_result',
          toolCallId: toolId,
          cwd: turn.cwd,
          name,
          ...(mergedInput.fullInput !== undefined ? { fullInput: mergedInput.fullInput } : {}),
          status: itemStatus,
          output: output.fullText || priorItem?.text || '',
        });
      }

      turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
      return;
    }

    if (kind === 'plan') {
      const text = formatPlanNotice(update.entries);
      if (!text) return;
      this.emitItem(turn, {
        id: `plan:${turn.executionId}`,
        kind: 'notice',
        role: 'assistant',
        text,
        executionId: turn.executionId,
        status: 'completed',
      });
      return;
    }

    if (kind === 'usage_update') {
      const used = Number(update.used);
      const size = Number(update.size);
      if (Number.isFinite(used) && Number.isFinite(size) && size > 0 && used >= 0) {
        turn.stream.push({
          type: 'context-usage',
          usedTokens: Math.round(used),
          windowTokens: Math.round(size),
          usedRatio: Math.min(1, Math.max(0, used / size)),
        });
      }
      return;
    }

    if (kind === 'session_info_update') {
      const title = typeof update.title === 'string' ? update.title.trim() : '';
      if (title) {
        appendAntigravitySessionRow(this.configRoot, turn.contextId, {
          type: 'title',
          cwd: turn.cwd,
          title,
        });
        turn.stream.push({ type: 'title', title });
      }
      return;
    }

    if (kind === 'current_mode_update' || kind === 'config_option_update') {
      if (handle.sessionPayload && typeof handle.sessionPayload === 'object') {
        if (kind === 'current_mode_update' && typeof update.currentModeId === 'string' && handle.sessionPayload.modes) {
          handle.sessionPayload.modes.currentModeId = update.currentModeId;
        }
        if (kind === 'config_option_update' && Array.isArray(update.configOptions)) {
          handle.sessionPayload.configOptions = update.configOptions;
        }
      }
      this.diagnostics?.({ event: 'antigravity-session-config-update', contextId: turn.contextId, kind });
      return;
    }

    if (kind === 'available_commands_update' || kind === 'user_message_chunk') {
      return;
    }

    this.diagnostics?.({ event: 'antigravity-unknown-session-update', contextId: turn.contextId, kind });
  }

  private async handleServerRequest(turn: TurnState, req: AntigravityAcpServerRequest): Promise<unknown> {
    if (!turn.pending || turn.cancelRequested) {
      return req.method === 'elicitation/create' ? { action: 'cancel' } : { outcome: { outcome: 'cancelled' } };
    }

    if (req.method === 'session/request_permission') {
      const params = req.params ?? {};
      const allowedOptions = antigravityPermissionOptions(params.options);
      if (!allowedOptions.length) {
        turn.stream.push({
          type: 'diagnostic',
          message: 'Antigravity 发出的权限请求不含可用的单次授权选项，已拒绝自动放行。',
        });
        return { outcome: { outcome: 'cancelled' } };
      }
      const toolCall = params.toolCall && typeof params.toolCall === 'object'
        ? (params.toolCall as Record<string, unknown>)
        : {};
      const parentToolId = typeof toolCall.toolCallId === 'string' && toolCall.toolCallId ? toolCall.toolCallId : undefined;
      const title = typeof toolCall.title === 'string' && toolCall.title.trim()
        ? `允许执行：${toolCall.title.trim()}`
        : 'Antigravity 请求执行工具操作';
      const requestId = `perm:${turn.executionId}:${String(req.id)}`;
      const wait = deferred<unknown>();

      const requestView: ExecutorRequest = {
        id: requestId,
        ...(parentToolId ? { parentToolId } : {}),
        kind: 'approval',
        blocking: true,
        title,
        options: allowedOptions.map(opt => ({ id: opt.optionId, label: opt.name })),
      };

      turn.requests.set(requestId, {
        request: requestView,
        parentToolId,
        resolveAnswer: answer => {
          const decided = antigravityPermissionOutcome(allowedOptions, answer);
          return { rpcResult: decided, approvedTool: decided.allowed };
        },
        settleRpc: value => wait.resolve(value),
        cancelValue: () => ({ outcome: { outcome: 'cancelled' } }),
      });

      turn.status = 'waiting';
      turn.stream.push({ type: 'request', request: requestView });
      turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
      return wait.promise;
    }

    if (req.method === 'elicitation/create') {
      const params = req.params ?? {};
      const requestId = `ask:${turn.executionId}:${String(req.id)}`;
      let form: ReturnType<typeof antigravityForm>;
      try {
        form = antigravityForm(params, requestId);
      } catch {
        turn.stream.push({
          type: 'diagnostic',
          message: 'Antigravity 发出了无法映射为标准问题的表单请求，已取消该请求。',
        });
        return { action: 'cancel' };
      }

      const wait = deferred<unknown>();
      turn.requests.set(requestId, {
        request: form.request,
        resolveAnswer: answer => ({ rpcResult: form.answer(answer) }),
        settleRpc: value => wait.resolve(value),
        cancelValue: () => ({ action: 'cancel' }),
      });

      turn.status = 'waiting';
      turn.stream.push({ type: 'request', request: form.request });
      turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
      return wait.promise;
    }

    throw new Error(`Unsupported server request method: ${req.method}`);
  }

  private emitItem(turn: TurnState, item: ExecutorItem): void {
    turn.items.set(item.id, item);
    turn.stream.push({ type: 'item', item });
  }

  private closeTextSegment(turn: TurnState, status: 'completed' | 'unknown'): void {
    if (!turn.textSegment) return;
    const existing = turn.items.get(turn.textSegment.id);
    turn.textSegment = undefined;
    if (existing && existing.status === 'running') {
      this.emitItem(turn, { ...existing, status });
    }
  }

  private reconcileFinalAssistantText(turn: TurnState, nativeText: string): void {
    const lastId = turn.lastMessage?.id;
    const lastItem = lastId ? turn.items.get(lastId) : undefined;
    const decision = reconcileAntigravityFinalText(
      lastItem?.text,
      nativeText,
      turn.lastMessage?.superseded ?? true,
    );
    if (decision.action === 'noop') return;
    if (decision.action === 'overwrite' && lastItem) {
      this.emitItem(turn, { ...lastItem, text: nativeText, status: 'completed' });
      appendAntigravitySessionRow(this.configRoot, turn.contextId, {
        type: 'assistant_segment',
        id: lastItem.id,
        cwd: turn.cwd,
        text: nativeText,
      });
      return;
    }
    const id = `message:${turn.executionId}:${++turn.segmentCounter}`;
    turn.lastMessage = { id, superseded: false };
    this.emitItem(turn, {
      id,
      kind: 'message',
      role: 'assistant',
      text: nativeText,
      executionId: turn.executionId,
      status: 'completed',
    });
    appendAntigravitySessionRow(this.configRoot, turn.contextId, {
      type: 'assistant_segment',
      id,
      cwd: turn.cwd,
      text: nativeText,
    });
  }

  private buildObservation(turn: TurnState | undefined): ExecutorObservation {
    if (!turn) {
      return { status: 'idle', tools: [], requests: [] };
    }
    return {
      status: turn.status,
      ...(turn.fault ? { fault: turn.fault } : {}),
      backgroundWork: turn.backgroundWork,
      executionRef: turn.executionRef,
      tools: [...turn.tools.values()],
      requests: [...turn.requests.values()].map(r => r.request),
      ...(turn.diagnostic ? { diagnostic: turn.diagnostic } : {}),
    };
  }

  async observe(input: { contextRef: ContextRef; executionRef?: ExecutionRef }): Promise<ExecutorObservation> {
    const turn = this.turns.get(input.contextRef.id);
    if (!turn || (input.executionRef && turn.executionId !== input.executionRef.id)) {
      return { status: 'idle', tools: [], requests: [] };
    }
    if (turn.backgroundWork) {
      const rows = readImmutableJsonlFile(antigravityNativeTranscriptPath(this.configRoot, input.contextRef.id)) ?? [];
      const latestComplete = rows.findLast(row => row?.sessionId === input.contextRef.id && row?.type === 'turn_complete');
      if (latestComplete?.backgroundActive === false && [...turn.tools.values()].every(tool => tool.status === 'completed')) {
        const handle = this.coordinator.getConversationProcess(input.contextRef.id);
        if (handle) this.finishBackgroundTurn(turn, handle);
      }
    }
    return this.buildObservation(turn);
  }

  async reply(input: { contextRef: ContextRef; executionRef: ExecutionRef; requestId: string; answer: unknown }): Promise<void> {
    const turn = this.turns.get(input.contextRef.id);
    if (!turn || turn.executionId !== input.executionRef.id || !turn.pending || turn.cancelRequested) {
      throw new AgentServiceError('agent_request_not_found', '待处理的审批或提问已不存在。', 404);
    }
    const pending = turn.requests.get(input.requestId);
    if (!pending) {
      throw new AgentServiceError('agent_request_not_found', '待处理的审批或提问已不存在。', 404);
    }
    // Validate BEFORE removing from `turn.requests` so invalid answers preserve the pending request.
    const resolved = pending.resolveAnswer(input.answer);
    turn.requests.delete(input.requestId);
    turn.status = turn.requests.size > 0 ? 'waiting' : 'running';
    pending.settleRpc(resolved.rpcResult);
    turn.stream.push({ type: 'request-resolved', requestId: input.requestId });
    turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
  }

  async stop(input: { contextRef: ContextRef; executionRef: ExecutionRef }): Promise<ExecutorObservation> {
    const turn = this.turns.get(input.contextRef.id);
    if (!turn || turn.executionId !== input.executionRef.id) {
      return { status: 'idle', tools: [], requests: [] };
    }
    if (turn.stopping) return turn.stopping;
    const work = this.executeStop(turn).finally(() => {
      if (turn.stopping === work) turn.stopping = undefined;
    });
    turn.stopping = work;
    return work;
  }

  private async executeStop(turn: TurnState): Promise<ExecutorObservation> {
    if (turn.stopConfirmed) return this.buildObservation(turn);
    const handle = this.coordinator.getConversationProcess(turn.contextId);

    if (!turn.cancelRequested) {
      turn.cancelRequested = true;
      for (const [, pending] of turn.requests) {
        pending.settleRpc(pending.cancelValue());
        turn.stream.push({ type: 'request-resolved', requestId: pending.request.id });
      }
      turn.requests.clear();
      handle?.client.notify('session/cancel', { sessionId: turn.contextId });
    }

    if (turn.pending) {
      await bounded(turn.settled, STOP_CANCEL_GRACE_MS).catch(() => {});
    }

    if (turn.stopConfirmed) {
      return this.buildObservation(turn);
    }

    if (handle) {
      const nativeSettled =
        !turn.pending
        && !turn.backgroundWork
        && (turn.status === 'stopped' || turn.status === 'idle')
        && [...turn.tools.values()].every(t => t.status === 'completed');
      const groupIdle = nativeSettled
        && (await handle.client.released(turn.executionRef, turn.contextId, this.bindingIdentity, true));
      if (groupIdle) {
        turn.stopConfirmed = true;
        turn.status = 'stopped';
        this.releaseProofs.add(this.releaseKey(turn.contextId, turn.executionRef));
      } else {
        const killedAndIdle = await handle.client.stopExecution(turn.executionRef, turn.contextId, this.bindingIdentity);
        await this.coordinator.closeConversationProcess(turn.contextId);
        await bounded(turn.settled, 1_000).catch(() => {});
        if (killedAndIdle) {
          turn.stopConfirmed = true;
          this.clearBackgroundTracking(turn);
          turn.status = 'stopped';
          this.closeTextSegment(turn, 'unknown');
          for (const [id, tool] of turn.tools) {
            if (tool.status !== 'completed') {
              turn.tools.set(id, { ...tool, status: 'unknown' });
            }
          }
          for (const [, item] of turn.items) {
            if (item.kind === 'tool' && item.status === 'running') {
              this.emitItem(turn, { ...item, status: 'unknown' });
            }
          }
          turn.diagnostic = '本对话所属 Antigravity 进程组已确认退出；未收到完成回执的工具保持未知状态。';
          this.releaseProofs.add(this.releaseKey(turn.contextId, turn.executionRef));
        } else {
          turn.status = 'unknown';
          turn.diagnostic = '尚未确认本对话 Antigravity 进程组完全退出，未报告为已停止。';
        }
      }
    } else if (await releasedNativeControl(PROVIDER, {
      bindingIdentity: this.bindingIdentity,
      contextRef: { id: turn.contextId, data: { native: opaqueReference(PROVIDER, turn.contextId, turn.cwd, this.bindingIdentity) } },
      executionRef: turn.executionRef,
      cwd: turn.cwd,
    }, { allowUnknownBackgroundWork: true })) {
      turn.stopConfirmed = true;
      this.clearBackgroundTracking(turn);
      turn.status = 'stopped';
      this.releaseProofs.add(this.releaseKey(turn.contextId, turn.executionRef));
    } else {
      turn.status = 'unknown';
    }

    turn.stream.flush();
    turn.stream.push({ type: 'observation', observation: this.buildObservation(turn) });
    return this.buildObservation(turn);
  }

  private releaseKey(contextId: string, executionRef: ExecutionRef): string {
    return JSON.stringify([contextId, executionRef.id, executionRef.data?.resourceGroup, executionRef.data?.resourceBinding]);
  }

  async prepareRelease(input: { contextRef: ContextRef; executionRef: ExecutionRef }): Promise<boolean> {
    const turn = this.turns.get(input.contextRef.id);
    if (turn && turn.executionId === input.executionRef.id) {
      if (turn.pending || turn.backgroundWork || turn.requests.size > 0) return false;
      if (!['idle', 'stopped'].includes(turn.status)) return false;
    }
    await this.coordinator.closeConversationProcess(input.contextRef.id);
    return true;
  }

  async canRelease(input: {
    contextRef: ContextRef;
    executionRef: ExecutionRef;
  }): Promise<boolean | { executionState: 'ended' | 'unknown' }> {
    const turn = this.turns.get(input.contextRef.id);
    if (turn && turn.executionId === input.executionRef.id) {
      if (turn.pending || turn.backgroundWork || turn.requests.size > 0) return false;
      if (!['idle', 'stopped'].includes(turn.status)) return false;
    }

    const handle = this.coordinator.getConversationProcess(input.contextRef.id);
    let released = false;
    if (handle) {
      released = await handle.client.released(input.executionRef, input.contextRef.id, this.bindingIdentity, true);
    } else if (this.releaseProofs.has(this.releaseKey(input.contextRef.id, input.executionRef))) {
      released = true;
    } else if (typeof input.contextRef.data?.cwd === 'string') {
      released = await releasedNativeControl(
        PROVIDER,
        {
          bindingIdentity: this.bindingIdentity,
          contextRef: input.contextRef,
          executionRef: input.executionRef,
          cwd: input.contextRef.data.cwd,
        },
        { allowUnknownBackgroundWork: turn?.stopConfirmed === true },
      );
    }
    if (!released) return false;
    if (turn && [...turn.tools.values()].some(t => t.status !== 'completed')) {
      return { executionState: 'unknown' };
    }
    return true;
  }

  async canReclaimStorage(): Promise<boolean> {
    if (!this.closedFlag) return false;
    return this.coordinator.canReclaimStorage();
  }

  async readHistory(input: { contextRef: ContextRef; cwd: string }): Promise<ExecutorItem[]> {
    const parsed = parseReference(
      String(input.contextRef.data?.native ?? ''),
      PROVIDER,
      input.cwd,
      this.bindingIdentity,
    );
    if (parsed.nativeSessionId !== input.contextRef.id || !isValidAntigravityContextId(input.contextRef.id)) {
      throw new Error('agent_context_binding_mismatch');
    }

    const items = new Map<string, ExecutorItem>();
    const seenUserTexts = new Set<string>();

    const durableRows = readImmutableJsonlFile(antigravitySessionRecordPath(this.configRoot, input.contextRef.id)) ?? [];
    for (const row of durableRows) {
      if (row?.sessionId !== input.contextRef.id || (row.cwd !== undefined && row.cwd !== input.cwd)) continue;
      if (row.type === 'user' && typeof row.text === 'string' && typeof row.id === 'string') {
        const clientRequestId = typeof row.clientRequestId === 'string' ? row.clientRequestId : undefined;
        seenUserTexts.add(row.text);
        items.set(`message:${row.id}`, {
          id: row.id,
          ...(clientRequestId ? { clientRequestId } : {}),
          kind: 'message',
          role: 'user',
          text: row.text,
          status: 'completed',
        });
      } else if (row.type === 'assistant_segment' && typeof row.id === 'string' && typeof row.text === 'string') {
        items.set(`message:${row.id}`, {
          id: row.id,
          kind: 'message',
          role: 'assistant',
          text: row.text,
          status: 'completed',
        });
      } else if ((row.type === 'tool_call' || row.type === 'tool_result') && typeof row.toolCallId === 'string') {
        const prior = items.get(`tool:${row.toolCallId}`);
        const status = row.status === 'failed' ? 'failed' : row.status === 'running' ? 'running' : 'completed';
        items.set(`tool:${row.toolCallId}`, {
          id: row.toolCallId,
          kind: 'tool',
          role: 'assistant',
          name: typeof row.name === 'string' ? row.name : prior?.name ?? '工具',
          ...(typeof row.fullInput === 'string' ? { input: row.fullInput } : prior?.input ? { input: prior.input } : {}),
          text: typeof row.output === 'string' ? row.output : prior?.text ?? '',
          nativeTool: true,
          status,
        });
      }
    }

    // Replay is a fallback for sessions without a durable projection. Live
    // and replay message IDs/splits differ, so merging both invents history.
    const activeTurn = this.turns.get(input.contextRef.id);
    if (!items.size && !activeTurn?.pending && !activeTurn?.backgroundWork) {
      const existingHandle = this.coordinator.getConversationProcess(input.contextRef.id);
      if (existingHandle && existingHandle.handshake.supportsLoad) {
        await this.replaySessionLoadInto(existingHandle, input.contextRef.id, input.cwd, items, seenUserTexts);
      } else {
        try {
          const probe = await this.verifyLiveAccountIdentity(
            typeof input.contextRef.data?.accountIdentity === 'string' ? input.contextRef.data.accountIdentity : undefined,
          );
          const tempHandle = await this.coordinator.acquireConversationProcess({
            contextId: input.contextRef.id,
            permissionMode: 'default',
            accountIdentity: probe.accountIdentity!,
            cwd: input.cwd,
            owner: this,
          });
          if (tempHandle.handshake.supportsLoad) {
            await this.replaySessionLoadInto(tempHandle, input.contextRef.id, input.cwd, items, seenUserTexts);
          }
        } catch {
          // Offline durable history remains authoritative when live process cannot be opened.
        }
      }
    }

    return [...items.values()];
  }

  private async replaySessionLoadInto(
    handle: ConversationProcessHandle,
    sessionId: string,
    cwd: string,
    items: Map<string, ExecutorItem>,
    seenUserTexts: Set<string>,
  ): Promise<void> {
    const existingAssistantTexts = new Set(
      [...items.values()]
        .filter(item => item.kind === 'message' && item.role === 'assistant')
        .map(item => item.text),
    );
    let replayIndex = 0;
    const replayed: ExecutorItem[] = [];
    handle.setHandlers({
      onNotification: (method, params) => {
        if (method !== 'session/update' || params.sessionId !== sessionId) return;
        const update = params.update as Record<string, unknown> | undefined;
        if (!update || typeof update.sessionUpdate !== 'string') return;
        if (update.sessionUpdate === 'user_message_chunk') {
          const text = extractAntigravityText(update.content);
          if (!text || seenUserTexts.has(text)) return;
          seenUserTexts.add(text);
          const id = typeof update.messageId === 'string' && update.messageId ? update.messageId : `replay-user:${++replayIndex}`;
          replayed.push({ id, kind: 'message', role: 'user', text, status: 'completed' });
        } else if (update.sessionUpdate === 'agent_message_chunk') {
          const text = extractAntigravityText(update.content);
          if (!text || existingAssistantTexts.has(text)) return;
          existingAssistantTexts.add(text);
          const id = typeof update.messageId === 'string' && update.messageId ? update.messageId : `replay-assistant:${++replayIndex}`;
          replayed.push({ id, kind: 'message', role: 'assistant', text, status: 'completed' });
        } else if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
          const toolId = typeof update.toolCallId === 'string' ? update.toolCallId : '';
          if (!toolId || items.has(`tool:${toolId}`)) return;
          const out = extractAntigravityToolOutput(update.content);
          const name = mapAntigravityToolName(update.kind, update.title, out.hasDiff);
          const merged = mergeAntigravityToolInput(update.rawInput, update.locations);
          replayed.push({
            id: toolId,
            kind: 'tool',
            role: 'assistant',
            name,
            ...(merged.previewInput ? { input: merged.previewInput } : {}),
            text: out.previewText,
            nativeTool: true,
            status: update.status === 'failed' ? 'failed' : 'completed',
          });
        }
      },
    });
    try {
      const loaded = await handle.client.request('session/load', { sessionId, cwd, mcpServers: [] }, 20_000);
      handle.loadedSessionId = sessionId;
      handle.sessionPayload = loaded;
      for (const entry of replayed) {
        const key = `${entry.kind}:${entry.id}`;
        if (!items.has(key)) items.set(key, entry);
      }
    } catch {
      // Missing/unsupported load is non-fatal during history reconciliation.
    } finally {
      handle.setHandlers({ onNotification: () => {} });
    }
  }

  async readTitle(input: { contextRef: ContextRef; cwd: string }): Promise<string | undefined> {
    const parsed = parseReference(
      String(input.contextRef.data?.native ?? ''),
      PROVIDER,
      input.cwd,
      this.bindingIdentity,
    );
    if (parsed.nativeSessionId !== input.contextRef.id || !isValidAntigravityContextId(input.contextRef.id)) {
      return undefined;
    }
    const durableRows = readImmutableJsonlFile(antigravitySessionRecordPath(this.configRoot, input.contextRef.id)) ?? [];
    const latestTitleRow = durableRows.findLast(
      row => row?.sessionId === input.contextRef.id && row?.type === 'title' && typeof row.title === 'string' && row.title.trim(),
    );
    if (latestTitleRow) return latestTitleRow.title.trim();

    const handle = this.coordinator.getConversationProcess(input.contextRef.id);
    if (handle) {
      try {
        const listed = await handle.client.request('session/list', { sessionId: input.contextRef.id }, 5_000);
        const matched = Array.isArray(listed?.sessions)
          ? listed.sessions.find((s: any) => s?.sessionId === input.contextRef.id && typeof s.title === 'string' && s.title.trim())
          : undefined;
        if (matched) return matched.title.trim();
      } catch {
        // Optional session/list metadata only; never synthesize from first prompt.
      }
    }
    return undefined;
  }

  async close(): Promise<void> {
    if (this.closedFlag) return;
    this.closedFlag = true;
    for (const turn of this.turns.values()) clearInterval(turn.backgroundTimer);
    await this.coordinator.closeProcessesOwnedBy(this);
  }
}

export function createAntigravityExecutor(): AgentExecutor {
  return {
    nativeContent: antigravityNativeContent,
    readReleasedControl: input => releasedNativeControl(PROVIDER, input),
    readPersistedExecution: input => readAntigravityPersistedExecution(input),
    storage: antigravityStorage(),
    descriptor: antigravityExecutorDescriptor,
    open: options => AntigravityRuntime.open(options),
  };
}
