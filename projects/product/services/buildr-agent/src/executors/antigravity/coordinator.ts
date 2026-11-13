import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type {
  AgentModel,
  ExecutionDiagnosticSink,
  LoginObservation,
  PermissionMode,
} from '../../contracts.ts';
import { AgentServiceError } from '../../domain/agent-state.ts';
import type { ModelQuotaObservation } from '../../model-access/contracts.ts';
import {
  bounded,
  executableIdentity,
  isolatedEnvironment,
  nativeHome,
  ownedProcessGroupIdle,
  privateDirectories,
  type NativeEnvironment,
} from '../native-process.ts';
import { AntigravityAcpClient, type AntigravityAcpServerRequest } from './acp.ts';
import { createAntigravityOpenerShim, redactAuthUrl } from './opener-shim.ts';
import { ensureAntigravityAutoUpdateDisabled } from './program.ts';

export interface AntigravityHandshakeCapabilities {
  image: boolean;
  supportsResume: boolean;
  supportsLoad: boolean;
  supportsClose: boolean;
  supportsLogout: boolean;
  supportsSystemPromptAppend: boolean;
}

export interface AntigravityTierObservation {
  id: 'free' | 'pro' | 'ultra' | 'unreadable';
  label: string;
  rawId?: string;
  rawName?: string;
  upgradeUri?: string;
}

export interface AntigravityAccountProbeResult {
  status: 'not-authenticated' | 'ready' | 'expired' | 'failed';
  accountIdentity?: string;
  explicitAccountIdentity: boolean;
  identityUnconfirmed?: boolean;
  accountLabel?: string;
  tier?: AntigravityTierObservation;
  models: Array<AgentModel & { images?: boolean; tools?: boolean; contextWindow?: number; maxOutputTokens?: number }>;
  quota: ModelQuotaObservation;
  capabilities?: AntigravityHandshakeCapabilities;
  diagnostic?: string;
}

export interface ConversationProcessHandlers {
  onNotification?: (method: string, params: Record<string, unknown>) => void;
  onServerRequest?: (request: AntigravityAcpServerRequest) => Promise<unknown>;
  onExit?: (reason: string) => void;
}

export interface ConversationProcessHandle {
  key: string;
  contextId: string;
  owner?: unknown;
  loadedSessionId?: string;
  appliedPolicyDigest?: string;
  sessionPayload?: any;
  readonly permissionMode: PermissionMode;
  readonly accountIdentity: string;
  readonly executableDigest: string;
  readonly client: AntigravityAcpClient;
  readonly handshake: AntigravityHandshakeCapabilities;
  setHandlers(handlers: ConversationProcessHandlers): void;
}

interface LoginEpochFile {
  identity: string;
  createdAt: string;
}

interface ActiveLoginState {
  id: string;
  cancelled: boolean;
  client: AntigravityAcpClient;
  authRequestId?: number;
  update: (value: LoginObservation) => void;
}

const PROBE_CACHE_TTL_MS = 2_500;
const coordinators = new Map<string, AntigravityCoordinator>();

export function parseHandshakeCapabilities(initResult: any): AntigravityHandshakeCapabilities {
  const caps = initResult?.agentCapabilities ?? {};
  const promptCaps = caps.promptCapabilities ?? caps.prompt_capabilities;
  const sessionCaps = caps.sessionCapabilities ?? caps.session_capabilities ?? {};
  const meta = caps._meta?.antigravity ?? {};
  return {
    image: Boolean(promptCaps?.image),
    supportsResume: Boolean(sessionCaps && typeof sessionCaps === 'object' && 'resume' in sessionCaps),
    supportsLoad: Boolean(caps.loadSession || caps.load_session || (sessionCaps && 'load' in sessionCaps)),
    supportsClose: Boolean(sessionCaps && typeof sessionCaps === 'object' && 'close' in sessionCaps),
    supportsLogout: Boolean(caps.auth && typeof caps.auth === 'object' && 'logout' in caps.auth),
    supportsSystemPromptAppend: Boolean(meta?.systemPrompt?.append),
  };
}

export function classifyAntigravityTier(rawTier: unknown): AntigravityTierObservation {
  if (!rawTier || (typeof rawTier !== 'object' && typeof rawTier !== 'string')) {
    return { id: 'unreadable', label: '档位不可读' };
  }
  const rawId = typeof rawTier === 'string'
    ? rawTier.trim()
    : typeof (rawTier as Record<string, unknown>).id === 'string'
      ? ((rawTier as Record<string, unknown>).id as string).trim()
      : '';
  const rawName = typeof rawTier === 'object' && typeof (rawTier as Record<string, unknown>).name === 'string'
    ? ((rawTier as Record<string, unknown>).name as string).trim()
    : '';
  const upgradeUri = typeof rawTier === 'object' && typeof (rawTier as Record<string, unknown>).upgradeUri === 'string'
    ? ((rawTier as Record<string, unknown>).upgradeUri as string).trim()
    : undefined;

  const combined = `${rawId} ${rawName}`.toLowerCase();
  const base = {
    ...(rawId ? { rawId } : {}),
    ...(rawName ? { rawName } : {}),
    ...(upgradeUri ? { upgradeUri } : {}),
  };
  if (/\bultra\b/.test(combined) || rawId.includes('ultra')) {
    return { id: 'ultra', label: 'Google AI Ultra', ...base };
  }
  if (/\bpro\b/.test(combined) || rawId.includes('pro')) {
    return { id: 'pro', label: 'Google AI Pro', ...base };
  }
  if (/\b(?:free|standard|basic)\b/.test(combined) || rawId === 'free-tier' || rawId === 'standard-tier') {
    return { id: 'free', label: '免费账号', ...base };
  }
  return { id: 'unreadable', label: '档位不可读', ...base };
}

function extractExplicitAccount(meta: Record<string, unknown>): {
  present: boolean;
  valid: boolean;
  identifier?: string;
  label?: string;
} {
  const hasField = Object.hasOwn(meta, 'account') || Object.hasOwn(meta, 'email') || Object.hasOwn(meta, 'userId');
  if (!hasField) return { present: false, valid: true };

  const candidates: Array<{ value: unknown; kind: 'email' | 'id' | 'account' }> = [
    { value: meta.email, kind: 'email' },
    { value: meta.userId, kind: 'id' },
    { value: meta.account, kind: 'account' },
  ];

  let chosenId: string | undefined;
  let chosenLabel: string | undefined;

  for (const item of candidates) {
    if (item.value === undefined) continue;
    if (item.value === null) return { present: true, valid: false };
    if (typeof item.value === 'string') {
      const trimmed = item.value.trim();
      if (!trimmed || trimmed.length > 320 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
        return { present: true, valid: false };
      }
      if (item.kind === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
        return { present: true, valid: false };
      }
      chosenId ??= trimmed.toLowerCase();
      if (item.kind === 'email' || !chosenLabel) chosenLabel = trimmed;
      continue;
    }
    if (typeof item.value === 'object' && !Array.isArray(item.value)) {
      const obj = item.value as Record<string, unknown>;
      const email = typeof obj.email === 'string' ? obj.email.trim() : undefined;
      const id = typeof obj.id === 'string' ? obj.id.trim() : typeof obj.userId === 'string' ? obj.userId.trim() : undefined;
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { present: true, valid: false };
      const picked = id || email;
      if (!picked || picked.length > 320 || /[\u0000-\u001f\u007f]/.test(picked)) {
        return { present: true, valid: false };
      }
      chosenId ??= picked.toLowerCase();
      chosenLabel ??= email || (typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : picked);
      continue;
    }
    return { present: true, valid: false };
  }

  if (!chosenId) return { present: true, valid: false };
  return { present: true, valid: true, identifier: chosenId, label: chosenLabel ?? chosenId };
}

function extractModelsFromSessionPayload(
  payload: any,
  supportsImage: boolean,
): Array<AgentModel & { images?: boolean; tools?: boolean }> {
  const rawModels = Array.isArray(payload?.models?.availableModels) ? payload.models.availableModels : [];
  const currentModelId = typeof payload?.models?.currentModelId === 'string' ? payload.models.currentModelId : undefined;
  const configOptions = Array.isArray(payload?.configOptions) ? payload.configOptions : [];
  const thoughtOption = configOptions.find((opt: any) => opt && opt.id === 'thought_level' && Array.isArray(opt.options));
  const reasoningEfforts = thoughtOption
    ? (thoughtOption.options as any[])
        .filter(item => item && typeof item.value === 'string' && item.value.trim())
        .map(item => ({
          id: String(item.value),
          label: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : String(item.value),
        }))
    : undefined;
  const defaultReasoningEffort = typeof thoughtOption?.currentValue === 'string' && thoughtOption.currentValue
    ? thoughtOption.currentValue
    : reasoningEfforts?.[0]?.id;

  const result: Array<AgentModel & { images?: boolean; tools?: boolean }> = [];
  const seen = new Set<string>();
  for (const item of rawModels) {
    const id = typeof item?.modelId === 'string' ? item.modelId.trim() : typeof item?.id === 'string' ? item.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : id;
    result.push({
      id,
      label,
      ...(currentModelId ? { isDefault: id === currentModelId } : result.length === 0 ? { isDefault: true } : {}),
      ...(reasoningEfforts?.length ? { reasoningEfforts } : {}),
      ...(defaultReasoningEffort ? { defaultReasoningEffort } : {}),
      images: supportsImage,
      tools: true,
    });
  }
  if (result.length && !result.some(m => m.isDefault)) {
    result[0]!.isDefault = true;
  }
  return result;
}

function unavailableQuota(tierLabel?: string, diagnostic?: string): ModelQuotaObservation {
  return {
    observedAt: new Date().toISOString(),
    available: false,
    ...(tierLabel ? { planLabel: tierLabel } : {}),
    ...(diagnostic ? { diagnostic } : {}),
  };
}

function extractQuotaFromMeta(meta: Record<string, unknown>, tierLabel?: string): ModelQuotaObservation {
  const observedAt = new Date().toISOString();
  const rawQuota = meta.quota;
  if (rawQuota && typeof rawQuota === 'object' && !Array.isArray(rawQuota)) {
    const q = rawQuota as Record<string, unknown>;
    if (typeof q.remainingRatio === 'number' && Number.isFinite(q.remainingRatio) && q.remainingRatio >= 0 && q.remainingRatio <= 1) {
      const remainingPercent = Math.round(q.remainingRatio * 100);
      return {
        observedAt,
        available: true,
        ...(tierLabel ? { planLabel: tierLabel } : {}),
        remainingPercent,
        windows: [{ id: 'primary', label: 'Google AI 周期额度', remainingPercent }],
      };
    }
  }
  return unavailableQuota(tierLabel, 'Antigravity CLI 当前未公开订阅剩余额度，模型仍可正常使用。');
}

function isUnauthenticatedError(error: unknown): boolean {
  const code = error && typeof error === 'object' ? (error as { acpCode?: unknown }).acpCode : undefined;
  const msg = error instanceof Error ? error.message : String(error ?? '');
  if (/no browser is available/i.test(msg)) return true;
  if (/authentication required|not signed in|please sign in|unauthenticated/i.test(msg)) return true;
  return code === -32000 && !/expired|invalid_grant/i.test(msg);
}

function isExpiredAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /invalid_grant|token expired|oauth.*expired|session expired/i.test(msg);
}

export class AntigravityCoordinator {
  readonly canonicalConfigRoot: string;
  private executable: string;
  private expectedExecutableDigest: string;
  private baseEnvironment: Readonly<Record<string, string>>;
  private cacheRoot?: string;
  private diagnostics?: ExecutionDiagnosticSink;

  private probeEpoch = 0;
  private probeCache?: { epoch: number; expiresAt: number; value: AntigravityAccountProbeResult };
  private inflightProbe?: { epoch: number; promise: Promise<AntigravityAccountProbeResult> };
  private activeLogin?: ActiveLoginState;

  private readonly conversationProcesses = new Map<string, ConversationProcessHandle>();
  private readonly conversationOpening = new Map<string, Promise<ConversationProcessHandle>>();
  private readonly contextToKey = new Map<string, string>();
  private readonly exitedGroups = new Set<number>();

  constructor(options: {
    canonicalConfigRoot: string;
    executable: string;
    expectedExecutableDigest: string;
    environment: Readonly<Record<string, string>>;
    cacheRoot?: string;
    diagnostics?: ExecutionDiagnosticSink;
  }) {
    this.canonicalConfigRoot = options.canonicalConfigRoot;
    this.executable = options.executable;
    this.expectedExecutableDigest = options.expectedExecutableDigest;
    this.baseEnvironment = options.environment;
    this.cacheRoot = options.cacheRoot;
    this.diagnostics = options.diagnostics;
  }

  updateRuntimeOptions(options: {
    executable: string;
    expectedExecutableDigest: string;
    environment: Readonly<Record<string, string>>;
    cacheRoot?: string;
    diagnostics?: ExecutionDiagnosticSink;
  }): void {
    if (this.executable !== options.executable || this.expectedExecutableDigest !== options.expectedExecutableDigest) {
      this.invalidateProbeCache();
    }
    this.executable = options.executable;
    this.expectedExecutableDigest = options.expectedExecutableDigest;
    this.baseEnvironment = options.environment;
    this.cacheRoot = options.cacheRoot;
    this.diagnostics = options.diagnostics ?? this.diagnostics;
  }

  get activeConversationProcessCount(): number {
    return this.conversationProcesses.size;
  }

  conversationProcessPids(): Array<{ contextId: string; permissionMode: PermissionMode; pid?: number }> {
    return [...this.conversationProcesses.values()].map(handle => ({
      contextId: handle.contextId,
      permissionMode: handle.permissionMode,
      pid: handle.client.pid,
    }));
  }

  invalidateProbeCache(): void {
    this.probeEpoch++;
    this.probeCache = undefined;
  }

  async verifyExecutableUnchanged(): Promise<string> {
    let currentDigest: string;
    try {
      currentDigest = await executableIdentity(this.executable);
    } catch {
      throw new AgentServiceError('agent_program_unavailable', '受管 Antigravity 程序已缺失或不可读，请重新检查程序。', 409);
    }
    if (currentDigest !== this.expectedExecutableDigest) {
      await this.closeAllConversationProcesses();
      throw new AgentServiceError('agent_binding_changed', '受管 Antigravity 程序文件身份已变化，不再继续视为原绑定；请通过 Buildr 重新核对或更新程序。', 409);
    }
    return currentDigest;
  }

  private async buildChildEnvironment(extra: NativeEnvironment = {}): Promise<{ env: NativeEnvironment; home: string; temporary: string }> {
    await ensureAntigravityAutoUpdateDisabled(this.canonicalConfigRoot);
    const { home, temporary } = nativeHome(this.canonicalConfigRoot);
    await privateDirectories(this.canonicalConfigRoot, home, temporary);
    const env = isolatedEnvironment(
      this.baseEnvironment,
      home,
      temporary,
      extra,
      this.cacheRoot,
      { credentialScope: 'host-keyring' },
    );
    return { env, home, temporary };
  }

  private loginEpochPath(): string {
    return path.join(this.canonicalConfigRoot, 'login-epoch.json');
  }

  private readLoginEpochSync(): LoginEpochFile | undefined {
    const file = this.loginEpochPath();
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) return undefined;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed.identity === 'string' && /^agy-epoch:[a-f0-9-]{36}$/.test(parsed.identity)) {
        return { identity: parsed.identity, createdAt: String(parsed.createdAt ?? '') };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private async writeLoginEpoch(identity: string): Promise<LoginEpochFile> {
    const file = this.loginEpochPath();
    const record: LoginEpochFile = { identity, createdAt: new Date().toISOString() };
    const temp = `${file}.${randomUUID()}`;
    try {
      await fsp.writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      await fsp.rename(temp, file);
    } finally {
      await fsp.rm(temp, { force: true });
    }
    return record;
  }

  async rotateLoginEpoch(): Promise<string> {
    const identity = `agy-epoch:${randomUUID()}`;
    await this.writeLoginEpoch(identity);
    this.invalidateProbeCache();
    return identity;
  }

  async clearLoginEpoch(): Promise<void> {
    await fsp.rm(this.loginEpochPath(), { force: true });
    this.invalidateProbeCache();
  }

  private async getOrCreateLoginEpoch(): Promise<string> {
    const existing = this.readLoginEpochSync();
    if (existing) return existing.identity;
    const identity = `agy-epoch:${randomUUID()}`;
    await this.writeLoginEpoch(identity);
    return identity;
  }

  async probeAccount(options: { forceFresh?: boolean } = {}): Promise<AntigravityAccountProbeResult> {
    await this.verifyExecutableUnchanged();
    const now = Date.now();
    if (!options.forceFresh && this.probeCache && this.probeCache.epoch === this.probeEpoch && this.probeCache.expiresAt > now) {
      return structuredClone(this.probeCache.value);
    }
    if (!options.forceFresh && this.inflightProbe && this.inflightProbe.epoch === this.probeEpoch) {
      return structuredClone(await this.inflightProbe.promise);
    }
    const epoch = this.probeEpoch;
    const work = this.executePassiveProbe().then(result => {
      if (this.probeEpoch === epoch) {
        this.probeCache = { epoch, expiresAt: Date.now() + PROBE_CACHE_TTL_MS, value: structuredClone(result) };
      }
      return result;
    }).finally(() => {
      if (this.inflightProbe?.promise === work) this.inflightProbe = undefined;
    });
    this.inflightProbe = { epoch, promise: work };
    return structuredClone(await work);
  }

  private async executePassiveProbe(): Promise<AntigravityAccountProbeResult> {
    const { env } = await this.buildChildEnvironment({ SSH_CONNECTION: '1' });
    const client = AntigravityAcpClient.open({
      executable: this.executable,
      args: ['acp'],
      cwd: this.canonicalConfigRoot,
      environment: env,
      diagnostics: this.diagnostics,
    });
    try {
      const initResult = await client.request(
        'initialize',
        { protocolVersion: 1, clientCapabilities: { elicitation: { form: {} } } },
        20_000,
      );
      const handshake = parseHandshakeCapabilities(initResult);
      const authMethods = Array.isArray(initResult?.authMethods) ? initResult.authMethods : [];
      if (!authMethods.some((m: any) => m?.id === 'oauth-personal')) {
        return {
          status: 'failed',
          explicitAccountIdentity: false,
          models: [],
          quota: unavailableQuota(),
          capabilities: handshake,
          diagnostic: '当前 Antigravity 程序未声明 oauth-personal 官方个人账号登录能力。',
        };
      }

      let authResult: any;
      try {
        authResult = await client.request('authenticate', { methodId: 'oauth-personal' }, 20_000);
      } catch (error) {
        if (isExpiredAuthError(error)) {
          await this.clearLoginEpoch();
          return {
            status: 'expired',
            explicitAccountIdentity: false,
            models: [],
            quota: unavailableQuota(),
            capabilities: handshake,
            diagnostic: 'Google 个人账号登录已过期，请重新登录。',
          };
        }
        if (isUnauthenticatedError(error)) {
          await this.clearLoginEpoch();
          return {
            status: 'not-authenticated',
            explicitAccountIdentity: false,
            models: [],
            quota: unavailableQuota(),
            capabilities: handshake,
            diagnostic: '请先使用 Google 个人账号完成官方登录。',
          };
        }
        return {
          status: 'failed',
          explicitAccountIdentity: false,
          models: [],
          quota: unavailableQuota(),
          capabilities: handshake,
          diagnostic: '无法核实 Google 个人账号状态，请稍后重新检查。',
        };
      }

      let sessionResult: any;
      try {
        sessionResult = await client.request('session/new', { cwd: this.canonicalConfigRoot, mcpServers: [] }, 30_000);
      } catch (error) {
        if (isExpiredAuthError(error)) {
          await this.clearLoginEpoch();
          return {
            status: 'expired',
            explicitAccountIdentity: false,
            models: [],
            quota: unavailableQuota(),
            capabilities: handshake,
            diagnostic: 'Google 个人账号登录已过期，请重新登录。',
          };
        }
        if (isUnauthenticatedError(error)) {
          await this.clearLoginEpoch();
          return {
            status: 'not-authenticated',
            explicitAccountIdentity: false,
            models: [],
            quota: unavailableQuota(),
            capabilities: handshake,
            diagnostic: '请先使用 Google 个人账号完成官方登录。',
          };
        }
        return {
          status: 'failed',
          explicitAccountIdentity: false,
          models: [],
          quota: unavailableQuota(),
          capabilities: handshake,
          diagnostic: '已通过认证握手，但读取 Antigravity 可用模型目录失败。',
        };
      }

      const probeSessionId = typeof sessionResult?.sessionId === 'string' ? sessionResult.sessionId : undefined;
      if (probeSessionId && handshake.supportsClose) {
        await client.request('session/close', { sessionId: probeSessionId }, 5_000).catch(() => {});
      }

      const authMeta = authResult?._meta?.antigravity && typeof authResult._meta.antigravity === 'object'
        ? (authResult._meta.antigravity as Record<string, unknown>)
        : {};
      const sessionMeta = sessionResult?._meta?.antigravity && typeof sessionResult._meta.antigravity === 'object'
        ? (sessionResult._meta.antigravity as Record<string, unknown>)
        : {};
      const mergedMeta: Record<string, unknown> = { ...authMeta, ...sessionMeta };

      const explicit = extractExplicitAccount(mergedMeta);
      if (explicit.present && !explicit.valid) {
        return {
          status: 'failed',
          explicitAccountIdentity: true,
          identityUnconfirmed: true,
          models: [],
          quota: unavailableQuota(),
          capabilities: handshake,
          diagnostic: '身份不可确认：Antigravity 返回的 Google 账号标识字段损坏或无法核实，已拒绝用于发送。',
        };
      }

      const tier = classifyAntigravityTier(mergedMeta.tier);
      const accountIdentity = explicit.present && explicit.identifier
        ? `agy-account:${createHash('sha256').update(explicit.identifier).digest('hex')}`
        : await this.getOrCreateLoginEpoch();
      const accountLabel = explicit.present && explicit.label
        ? `${explicit.label} · ${tier.label}`
        : `Google 个人账号（agy 未公开邮箱） · ${tier.label}`;

      const models = extractModelsFromSessionPayload(sessionResult, handshake.image);
      const quota = extractQuotaFromMeta(mergedMeta, tier.label);

      if (!models.length) {
        return {
          status: 'failed',
          accountIdentity,
          explicitAccountIdentity: explicit.present,
          accountLabel,
          tier,
          models: [],
          quota,
          capabilities: handshake,
          diagnostic: 'Google 账号已登录，但 Antigravity 未返回任何可用模型。',
        };
      }

      return {
        status: 'ready',
        accountIdentity,
        explicitAccountIdentity: explicit.present,
        accountLabel,
        tier,
        models,
        quota,
        capabilities: handshake,
      };
    } finally {
      await client.close();
    }
  }

  async beginLogin(update: (value: LoginObservation) => void): Promise<void> {
    await this.verifyExecutableUnchanged();
    await this.cancelLogin();
    this.invalidateProbeCache();

    const attemptId = randomUUID();
    update({ state: 'initializing' });

    const { temporary } = nativeHome(this.canonicalConfigRoot);
    await privateDirectories(this.canonicalConfigRoot, temporary);
    const shim = await createAntigravityOpenerShim(temporary, attemptId);

    const basePath = this.baseEnvironment.PATH ?? process.env.PATH ?? '';
    const { env } = await this.buildChildEnvironment({
      PATH: `${shim.directory}${path.delimiter}${basePath}`,
      BROWSER: shim.openerScript,
    });
    delete env.SSH_CONNECTION;
    delete env.SSH_CLIENT;
    delete env.SSH_TTY;

    const client = AntigravityAcpClient.open({
      executable: this.executable,
      args: ['acp'],
      cwd: this.canonicalConfigRoot,
      environment: env,
      diagnostics: this.diagnostics,
    });

    const loginState: ActiveLoginState = {
      id: attemptId,
      cancelled: false,
      client,
      update,
    };
    this.activeLogin = loginState;

    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let publishedUrl = '';
    const pollShim = async () => {
      if (this.activeLogin !== loginState || loginState.cancelled) return;
      const captured = await shim.readCapturedUrl();
      if (!captured || captured === publishedUrl) return;
      if (this.activeLogin !== loginState || loginState.cancelled) return;
      publishedUrl = captured;
      this.diagnostics?.({ event: 'antigravity-login-url-ready', url: redactAuthUrl(captured) });
      update({ state: 'waiting-browser', url: captured });
    };

    try {
      await client.request('initialize', { protocolVersion: 1, clientCapabilities: { elicitation: { form: {} } } }, 20_000);
      if (this.activeLogin !== loginState || loginState.cancelled) return;

      pollTimer = setInterval(() => {
        void pollShim();
      }, 40);
      pollTimer.unref?.();

      const authCall = client.requestWithId('authenticate', { methodId: 'oauth-personal' }, 15 * 60_000);
      loginState.authRequestId = authCall.requestId;

      await bounded(authCall.promise, 15 * 60_000, 'antigravity_login_timeout');
      await pollShim();
      if (this.activeLogin !== loginState || loginState.cancelled) return;

      clearInterval(pollTimer);
      pollTimer = undefined;

      await this.rotateLoginEpoch();
      update({ state: 'checking' });

      const verified = await this.probeAccount({ forceFresh: true });
      if (this.activeLogin !== loginState || loginState.cancelled) return;

      if (verified.status === 'ready') {
        update({ state: 'completed' });
      } else if (verified.status === 'expired') {
        update({ state: 'expired', diagnostic: verified.diagnostic ?? 'Google 账号登录已过期，请重新登录。' });
      } else {
        update({ state: 'failed', diagnostic: verified.diagnostic ?? 'Google 账号登录未完成验证，请重试。' });
      }
    } catch (error) {
      if (this.activeLogin !== loginState || loginState.cancelled) return;
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'antigravity_login_timeout' || isExpiredAuthError(error)) {
        update({ state: 'expired', diagnostic: '登录等待已超时或授权已过期，请重新发起官方登录。' });
      } else {
        update({ state: 'failed', diagnostic: 'Google 官方登录未能完成，请重试。' });
      }
    } finally {
      if (pollTimer) clearInterval(pollTimer);
      if (this.activeLogin === loginState) {
        this.activeLogin = undefined;
      }
      await client.close();
      await shim.dispose();
    }
  }

  async cancelLogin(): Promise<void> {
    const login = this.activeLogin;
    if (!login) return;
    this.activeLogin = undefined;
    login.cancelled = true;
    this.invalidateProbeCache();
    if (login.authRequestId !== undefined) {
      login.client.notify('$/cancelRequest', { id: login.authRequestId });
    }
    await login.client.close();
    login.update({ state: 'cancelled' });
  }

  async logoutAccount(): Promise<void> {
    await this.verifyExecutableUnchanged();
    await this.cancelLogin();
    this.invalidateProbeCache();
    await this.closeAllConversationProcesses();

    const { env } = await this.buildChildEnvironment({ SSH_CONNECTION: '1' });
    const client = AntigravityAcpClient.open({
      executable: this.executable,
      args: ['acp'],
      cwd: this.canonicalConfigRoot,
      environment: env,
      diagnostics: this.diagnostics,
    });
    try {
      await client.request('initialize', { protocolVersion: 1, clientCapabilities: { elicitation: { form: {} } } }, 15_000);
      await client.request('logout', {}, 15_000);
      await this.clearLoginEpoch();
    } finally {
      this.invalidateProbeCache();
      await client.close();
    }
  }

  async acquireConversationProcess(input: {
    contextId: string;
    permissionMode: PermissionMode;
    accountIdentity: string;
    cwd: string;
    owner?: unknown;
    onNotification?: (method: string, params: Record<string, unknown>) => void;
    onServerRequest?: (request: AntigravityAcpServerRequest) => Promise<unknown>;
    onExit?: (reason: string) => void;
  }): Promise<ConversationProcessHandle> {
    const exeDigest = await this.verifyExecutableUnchanged();
    const desiredKey = JSON.stringify([input.contextId, input.permissionMode, input.accountIdentity, exeDigest]);

    const priorKey = this.contextToKey.get(input.contextId);
    if (priorKey && priorKey !== desiredKey) {
      const prior = this.conversationProcesses.get(priorKey);
      this.conversationProcesses.delete(priorKey);
      this.contextToKey.delete(input.contextId);
      if (prior) {
        if (prior.client.pid) this.exitedGroups.add(prior.client.pid);
        await prior.client.close();
      }
    }

    const existing = this.conversationProcesses.get(desiredKey);
    if (existing && !existing.client.transportClosed) {
      if (input.owner !== undefined) existing.owner = input.owner;
      existing.setHandlers({
        onNotification: input.onNotification,
        onServerRequest: input.onServerRequest,
        onExit: input.onExit,
      });
      return existing;
    }
    if (existing) {
      if (existing.client.pid) this.exitedGroups.add(existing.client.pid);
      this.conversationProcesses.delete(desiredKey);
      if (this.contextToKey.get(input.contextId) === desiredKey) this.contextToKey.delete(input.contextId);
    }

    const opening = this.conversationOpening.get(desiredKey);
    if (opening) {
      const handle = await opening;
      if (input.owner !== undefined) handle.owner = input.owner;
      handle.setHandlers({
        onNotification: input.onNotification,
        onServerRequest: input.onServerRequest,
        onExit: input.onExit,
      });
      return handle;
    }

    const createPromise = (async (): Promise<ConversationProcessHandle> => {
      const { env } = await this.buildChildEnvironment({ SSH_CONNECTION: '1' });
      const args = ['acp', ...(input.permissionMode === 'full-access' ? ['--dangerously-skip-permissions'] : [])];
      let currentHandlers: ConversationProcessHandlers = {
        onNotification: input.onNotification,
        onServerRequest: input.onServerRequest,
        onExit: input.onExit,
      };
      let handleRef: ConversationProcessHandle | undefined;
      const client = AntigravityAcpClient.open({
        executable: this.executable,
        args,
        cwd: input.cwd,
        environment: env,
        diagnostics: this.diagnostics,
        onNotification: (method, params) => currentHandlers.onNotification?.(method, params),
        onServerRequest: request => {
          if (!currentHandlers.onServerRequest) return Promise.reject(new Error('acp_server_request_unsupported'));
          return currentHandlers.onServerRequest(request);
        },
        onExit: reason => {
          if (client.pid) this.exitedGroups.add(client.pid);
          const activeKey = handleRef?.key ?? desiredKey;
          const activeContextId = handleRef?.contextId ?? input.contextId;
          if (this.conversationProcesses.get(activeKey)?.client === client) {
            this.conversationProcesses.delete(activeKey);
            if (this.contextToKey.get(activeContextId) === activeKey) this.contextToKey.delete(activeContextId);
          }
          currentHandlers.onExit?.(reason);
        },
      });
      try {
        const initResult = await client.request(
          'initialize',
          { protocolVersion: 1, clientCapabilities: { elicitation: { form: {} } } },
          30_000,
        );
        const handshake = parseHandshakeCapabilities(initResult);
        if (!initResult?.agentCapabilities?.promptCapabilities && !initResult?.agentCapabilities?.prompt_capabilities) {
          throw new AgentServiceError('agent_protocol_capability_missing', 'Antigravity 程序缺少对话提示能力（promptCapabilities），无法执行对话。', 409);
        }
        if (!handshake.supportsResume) {
          throw new AgentServiceError('agent_protocol_capability_missing', 'Antigravity 程序缺少会话恢复能力（session/resume），无法保障上下文恢复契约。', 409);
        }
        const handle: ConversationProcessHandle = {
          key: desiredKey,
          contextId: input.contextId,
          owner: input.owner,
          permissionMode: input.permissionMode,
          accountIdentity: input.accountIdentity,
          executableDigest: exeDigest,
          client,
          handshake,
          setHandlers(handlers) {
            currentHandlers = {
              onNotification: handlers.onNotification ?? currentHandlers.onNotification,
              onServerRequest: handlers.onServerRequest ?? currentHandlers.onServerRequest,
              onExit: handlers.onExit ?? currentHandlers.onExit,
            };
          },
        };
        handleRef = handle;
        this.conversationProcesses.set(desiredKey, handle);
        this.contextToKey.set(input.contextId, desiredKey);
        return handle;
      } catch (error) {
        if (client.pid) this.exitedGroups.add(client.pid);
        await client.close();
        throw error;
      }
    })().finally(() => {
      if (this.conversationOpening.get(desiredKey) === createPromise) {
        this.conversationOpening.delete(desiredKey);
      }
    });

    this.conversationOpening.set(desiredKey, createPromise);
    return createPromise;
  }

  adoptProvisionalProcess(provisionalContextId: string, actualContextId: string): ConversationProcessHandle | undefined {
    const oldKey = this.contextToKey.get(provisionalContextId);
    if (!oldKey) return undefined;
    const handle = this.conversationProcesses.get(oldKey);
    this.contextToKey.delete(provisionalContextId);
    this.conversationProcesses.delete(oldKey);
    if (!handle || handle.client.transportClosed) return undefined;
    const newKey = JSON.stringify([actualContextId, handle.permissionMode, handle.accountIdentity, handle.executableDigest]);
    handle.key = newKey;
    handle.contextId = actualContextId;
    this.conversationProcesses.set(newKey, handle);
    this.contextToKey.set(actualContextId, newKey);
    return handle;
  }

  getConversationProcess(contextId: string): ConversationProcessHandle | undefined {
    const key = this.contextToKey.get(contextId);
    if (!key) return undefined;
    const handle = this.conversationProcesses.get(key);
    if (handle && !handle.client.transportClosed) return handle;
    return undefined;
  }

  async closeConversationProcess(contextId: string): Promise<void> {
    const key = this.contextToKey.get(contextId);
    this.contextToKey.delete(contextId);
    if (!key) return;
    const handle = this.conversationProcesses.get(key);
    this.conversationProcesses.delete(key);
    if (handle) {
      if (handle.client.pid) this.exitedGroups.add(handle.client.pid);
      await handle.client.close();
    }
  }

  async closeProcessesOwnedBy(owner: unknown): Promise<void> {
    const matched: ConversationProcessHandle[] = [];
    for (const [key, handle] of this.conversationProcesses) {
      if (handle.owner !== owner) continue;
      this.conversationProcesses.delete(key);
      if (this.contextToKey.get(handle.contextId) === key) {
        this.contextToKey.delete(handle.contextId);
      }
      if (handle.client.pid) this.exitedGroups.add(handle.client.pid);
      matched.push(handle);
    }
    await Promise.allSettled(matched.map(h => h.client.close()));
  }

  async closeAllConversationProcesses(): Promise<void> {
    const handles = [...this.conversationProcesses.values()];
    this.conversationProcesses.clear();
    this.contextToKey.clear();
    for (const h of handles) {
      if (h.client.pid) this.exitedGroups.add(h.client.pid);
    }
    await Promise.allSettled(handles.map(h => h.client.close()));
  }

  async canReclaimStorage(): Promise<boolean> {
    if (this.conversationProcesses.size > 0 || this.conversationOpening.size > 0 || this.activeLogin) {
      return false;
    }
    if (process.platform === 'win32') return true;
    for (const pid of [...this.exitedGroups]) {
      if (!(await ownedProcessGroupIdle(pid))) return false;
      this.exitedGroups.delete(pid);
    }
    return true;
  }
}

export function acquireAntigravityCoordinator(options: {
  configRoot: string;
  executable: string;
  expectedExecutableDigest: string;
  environment: Readonly<Record<string, string>>;
  cacheRoot?: string;
  diagnostics?: ExecutionDiagnosticSink;
}): AntigravityCoordinator {
  const canonicalConfigRoot = fs.realpathSync(options.configRoot);
  const existing = coordinators.get(canonicalConfigRoot);
  if (existing) {
    existing.updateRuntimeOptions({
      executable: options.executable,
      expectedExecutableDigest: options.expectedExecutableDigest,
      environment: options.environment,
      cacheRoot: options.cacheRoot,
      diagnostics: options.diagnostics,
    });
    return existing;
  }
  const created = new AntigravityCoordinator({
    canonicalConfigRoot,
    executable: options.executable,
    expectedExecutableDigest: options.expectedExecutableDigest,
    environment: options.environment,
    cacheRoot: options.cacheRoot,
    diagnostics: options.diagnostics,
  });
  coordinators.set(canonicalConfigRoot, created);
  return created;
}

export function peekAntigravityCoordinator(configRoot: string): AntigravityCoordinator | undefined {
  try {
    return coordinators.get(fs.realpathSync(configRoot));
  } catch {
    return undefined;
  }
}
