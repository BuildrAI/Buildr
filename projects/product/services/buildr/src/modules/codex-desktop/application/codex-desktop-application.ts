import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CodexAgentRegistration } from '../../agent-operations/module.ts';
import { CodexDesktopRepository } from '../persistence/codex-desktop-repository.ts';
import { codexDesktopPluginId } from '../infrastructure/codex-plugin-installation.ts';
import {
  assertCodexText, codexDigest, codexFailure, codexSessionUrl, codexTaskUrl, isNativeSessionId,
  type CodexBinding, type CodexBindingView, type CodexDesktopConnection, type CodexDesktopConnectionView, type CodexConnectorLease,
  type CodexHandoffView, type CodexSessionRelation, type CodexWorkspaceSessions,
} from '../domain/codex-desktop.ts';

type Installation = { appPath: string; appVersion: string | null };
type Dependencies = {
  dataRoot: string;
  resolveWorkspace(id: string): { rootPath: string; workspace: { id: string; name?: string } };
  listWorkspaces(): { workspaces: { status: string; workspace: { id: string; name?: string } | null }[] };
  readTaskIdentity(root: string, id: string): { taskId: string; title: string; revision: string } | null;
  installPlugin(input: { registration: CodexAgentRegistration; installation: Installation; connectionId: string }): Promise<{ pluginVersion: string; entryIdentity?: string; status: 'awaiting-desktop'; safeReason: string | null }>;
  connectorEntryIdentity?: (connectionId: string) => string;
  readRegistrationActive?: (agentId: string) => boolean;
  readOrigin(): string | null;
  now?: () => number;
};
const REQUEST_TTL = 30 * 60_000;
const DISCONNECTED_REASON = 'Codex 接入已移除，桌面业务连接已停用；原聊天、配置、插件（Plugin）和任务关系均保留。重新确认接入后可恢复。';
function accountScope(home: string): string | null {
  // Only a hash of an optional public account identifier; no token is persisted.
  try {
    const file = path.join(home, 'auth.json'), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024) return null;
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const id = value?.tokens?.account_id ?? value?.account_id;
    return typeof id === 'string' && id ? codexDigest(id) : null;
  } catch { return null; }
}
function connectionScope(appPath: string, codexHome: string) {
  const home = fs.realpathSync(codexHome), stat = fs.statSync(home);
  return codexDigest({ appPath: fs.realpathSync(appPath), codexHome: home, homeDevice: stat.dev, homeInode: stat.ino, accountScope: accountScope(home) });
}
export class CodexDesktopApplication {
  private readonly repository: CodexDesktopRepository;
  private readonly now: () => number;
  private readonly dependencies: Dependencies;
  constructor(dependencies: Dependencies) { this.dependencies = dependencies; this.repository = new CodexDesktopRepository(dependencies.dataRoot); this.now = dependencies.now ?? Date.now; }
  private stamp() { return new Date(this.now()).toISOString(); }
  private ownerAlive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }
  private ownerMatches(owner: CodexConnectorLease, connection: CodexDesktopConnection) {
    return owner.connectionId === connection.id && owner.scopeIdentity === connection.scopeIdentity && owner.pluginVersion === connection.pluginVersion && owner.pluginEntryIdentity === connection.pluginEntryIdentity;
  }
  private connection(id: string) {
    const connection = this.repository.readConnections().connections.find(c => c.id === id);
    if (!connection) throw codexFailure('codex_connection_missing', 'Codex 桌面连接不存在，请在接入页面确认。', 404);
    return connection;
  }
  private assertConnectionScope(connection: CodexDesktopConnection) {
    if (connection.status === 'disconnected' || this.dependencies.readRegistrationActive && !this.dependencies.readRegistrationActive(connection.agentId)) throw codexFailure('codex_connection_disconnected', DISCONNECTED_REASON, 409);
    let identity: string;
    try { identity = connectionScope(connection.appPath, connection.codexHome); }
    catch { throw codexFailure('codex_connection_scope_changed', 'Codex 安装或配置来源不可用，请重新确认接入。', 409); }
    if (identity !== connection.scopeIdentity) throw codexFailure('codex_connection_scope_changed', 'Codex 配置或已观察账号范围已变化，旧关联保留，请重新确认接入。', 409);
    if (connection.pluginEntryIdentity && this.dependencies.connectorEntryIdentity && connection.pluginEntryIdentity !== this.dependencies.connectorEntryIdentity(connection.id)) throw codexFailure('codex_plugin_entry_changed', '当前连接组件仍使用旧产品入口，请刷新桌面连接。', 409);
  }
  private view(connection: CodexDesktopConnection): CodexDesktopConnectionView {
    let status = connection.status, safeReason = connection.safeReason;
    try { this.assertConnectionScope(connection); }
    catch (error) { status = (error as { code?: string }).code === 'codex_connection_disconnected' ? 'disconnected' : 'unavailable'; safeReason = (error as Error).message; }
    let lastSeenAt = connection.lastSeenAt;
    if (status === 'ready' || status === 'awaiting-desktop') {
      try {
        const owners = this.repository.readConnectorLeases().owners;
        const active = owners.filter(owner => owner.phase === 'active' && this.ownerMatches(owner, connection) && this.ownerAlive(owner.pid));
        const legacy = status === 'ready' && connection.connectorPid && !owners.some(owner => owner.connectionId === connection.id && owner.pid === connection.connectorPid) && this.ownerAlive(connection.connectorPid);
        if (active.length || legacy) {
          status = 'ready'; safeReason = null;
          lastSeenAt = active.map(owner => owner.startedAt).concat(lastSeenAt ?? []).sort().at(-1) ?? null;
        } else { status = 'awaiting-desktop'; safeReason = '桌面连接组件尚未加载，请在目标原聊天打开 Buildr 入口。'; }
      } catch { status = 'unavailable'; safeReason = 'Codex 桌面连接实例状态无法确认；原有关联保留。'; }
    }
    return { id: connection.id, agentId: connection.agentId, label: connection.label === 'Codex（ChatGPT）' ? 'Codex' : connection.label, installationLabel: connection.installationLabel === 'Codex（ChatGPT）桌面' ? 'Codex 桌面' : connection.installationLabel, configurationLabel: connection.configurationLabel, status, safeReason, pluginVersion: connection.pluginVersion, lastSeenAt };
  }
  listConnections() { return { connections: this.repository.readConnections().connections.map(c => this.view(c)) }; }
  assertConnectionActive(connectionId: string): void { this.assertConnectionScope(this.connection(connectionId)); }
  disconnect(agentId: string): void {
    this.repository.mutateConnectionRuntime((state, runtime) => {
      for (const connection of state.connections) if (connection.agentId === agentId) Object.assign(connection, { status: 'disconnected', safeReason: DISCONNECTED_REASON, connectorPid: null, preparationId: null });
      runtime.owners = runtime.owners.filter(owner => !state.connections.some(connection => connection.id === owner.connectionId && connection.agentId === agentId));
    });
  }
  listWorkspaces() { return { workspaces: this.dependencies.listWorkspaces().workspaces.filter(w => w.status === 'ready' && w.workspace).map(w => ({ id: w.workspace!.id, name: w.workspace!.name ?? w.workspace!.id })) }; }
  currentOrigin() {
    const origin = this.dependencies.readOrigin();
    if (!origin) return null;
    try { const url = new URL(origin); return url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ? url.origin : null; } catch { return null; }
  }
  async connect(registration: CodexAgentRegistration, installation: Installation) {
    if (this.dependencies.readRegistrationActive && !this.dependencies.readRegistrationActive(registration.id)) throw codexFailure('codex_connection_disconnected', DISCONNECTED_REASON, 409);
    const scopeIdentity = connectionScope(installation.appPath, registration.codexHome);
    const preparationId = crypto.randomUUID();
    let id: string;
    this.repository.mutateConnectionRuntime((state, runtime) => {
      let connection = state.connections.find(c => c.scopeIdentity === scopeIdentity);
      if (!connection) {
        if (state.connections.length >= 64) throw codexFailure('codex_connection_limit', 'Codex 桌面连接数量已达上限。', 409);
        connection = { id: 'codex-' + crypto.randomUUID(), agentId: registration.id, label: registration.label, installationLabel: 'Codex 桌面', configurationLabel: '已确认的 Codex 原生配置', status: 'pending', safeReason: null, pluginVersion: null, lastSeenAt: null, executable: registration.executable, codexHome: registration.codexHome, appPath: installation.appPath, appVersion: installation.appVersion, scopeIdentity, connectorPid: null, preparationId, pluginEntryIdentity: null };
        state.connections.push(connection);
      } else {
        const reconnect = connection.status === 'disconnected' || this.dependencies.readRegistrationActive && !this.dependencies.readRegistrationActive(connection.agentId);
        if (reconnect) runtime.owners = runtime.owners.filter(owner => owner.connectionId !== connection!.id);
        Object.assign(connection, { agentId: registration.id, executable: registration.executable, appVersion: installation.appVersion, label: registration.label, preparationId, ...(reconnect ? { status: 'pending', safeReason: null, connectorPid: null } : {}) });
      }
      id = connection.id;
    });
    try {
      const installed = await this.dependencies.installPlugin({ registration, installation, connectionId: id! });
      this.repository.mutateConnectionRuntime((state, runtime) => {
        const c = state.connections.find(c => c.id === id)!;
        if (c.preparationId !== preparationId) return;
        if (c.status === 'disconnected' || this.dependencies.readRegistrationActive && !this.dependencies.readRegistrationActive(c.agentId)) {
          Object.assign(c, { status: 'disconnected', safeReason: DISCONNECTED_REASON, connectorPid: null, preparationId: null }); return;
        }
        const activeSameVersion = c.status === 'ready' && c.pluginVersion === installed.pluginVersion && c.pluginEntryIdentity === (installed.entryIdentity ?? null);
        if (c.pluginVersion !== installed.pluginVersion || c.pluginEntryIdentity !== (installed.entryIdentity ?? null)) runtime.owners = runtime.owners.filter(owner => owner.connectionId !== c.id);
        Object.assign(c, { preparationId: null, pluginVersion: installed.pluginVersion, pluginEntryIdentity: installed.entryIdentity ?? null, ...(activeSameVersion ? {} : { status: installed.status, safeReason: installed.safeReason, connectorPid: null }) });
      });
    } catch (error) {
      this.repository.mutateConnections(state => {
        const c = state.connections.find(c => c.id === id)!;
        if (c.preparationId === preparationId) {
          const disconnected = c.status === 'disconnected' || this.dependencies.readRegistrationActive && !this.dependencies.readRegistrationActive(c.agentId);
          Object.assign(c, { status: disconnected ? 'disconnected' : 'unavailable', safeReason: disconnected ? DISCONNECTED_REASON : (error as Error).message, connectorPid: null, preparationId: null });
        }
      });
    }
    return this.view(this.connection(id!));
  }
  connectorStarted(connectionId: string, pluginVersion: string) {
    const connection = this.connection(connectionId);
    this.assertConnectionScope(connection);
    assertCodexText(pluginVersion, '连接组件版本');
    this.repository.mutateConnectionRuntime((state, runtime) => {
      const c = state.connections.find(c => c.id === connectionId)!;
      this.assertConnectionScope(c);
      if (c.pluginVersion !== pluginVersion) throw codexFailure('codex_plugin_version_changed', '桌面加载的连接版本与已安装版本不符，请刷新桌面连接。', 409);
      const startedAt = this.stamp();
      runtime.owners = runtime.owners.filter(owner => this.ownerAlive(owner.pid) && !(owner.connectionId === connectionId && owner.pid === process.pid));
      runtime.owners.push({ connectionId, pid: process.pid, scopeIdentity: c.scopeIdentity, pluginVersion, pluginEntryIdentity: c.pluginEntryIdentity, startedAt, phase: 'active' });
      Object.assign(c, { status: 'ready', safeReason: null, connectorPid: process.pid, lastSeenAt: startedAt });
    });
  }
  connectorStopped(connectionId: string, pid = process.pid) {
    this.repository.mutateConnectionRuntime((state, runtime) => {
      const c = state.connections.find(c => c.id === connectionId);
      runtime.owners = runtime.owners.filter(owner => this.ownerAlive(owner.pid) && !(owner.connectionId === connectionId && owner.pid === pid));
      if (c?.connectorPid === pid && c.status !== 'disconnected') {
        const disconnected = this.dependencies.readRegistrationActive && !this.dependencies.readRegistrationActive(c.agentId);
        const next = runtime.owners.filter(owner => owner.phase === 'active' && this.ownerMatches(owner, c)).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1);
        Object.assign(c, { status: disconnected ? 'disconnected' : next ? 'ready' : 'awaiting-desktop', connectorPid: disconnected ? null : next?.pid ?? null, safeReason: disconnected ? DISCONNECTED_REASON : next ? null : '桌面连接组件已断开，关联关系保留。' });
      }
    });
  }
  private workspace(id: string) {
    if (!isNativeSessionId(id)) throw codexFailure('codex_workspace_invalid', '工作空间（Workspace）身份无效。');
    const value = this.dependencies.resolveWorkspace(id);
    if (value.workspace.id !== id) throw codexFailure('codex_workspace_changed', '工作空间（Workspace）身份已变化。', 409);
    return value;
  }
  private task(root: string, taskId: string) {
    if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(taskId) || taskId.length > 200) throw codexFailure('codex_task_invalid', '任务身份无效。');
    const value = this.dependencies.readTaskIdentity(root, taskId);
    if (!value || !value.revision || value.taskId !== taskId) throw codexFailure('codex_task_missing', '任务不存在或当前不可用。', 404);
    return value;
  }
  private linkConnection(connectionId?: string) {
    if (connectionId) {
      const connection = this.connection(connectionId);
      this.assertConnectionScope(connection);
      return connection;
    }
    const candidates = this.repository.readConnections().connections.filter(connection => {
      try { this.assertConnectionScope(connection); return true; } catch { return false; }
    });
    if (!candidates.length) throw codexFailure('codex_connection_missing', '尚未接入可用的 Codex，请先在智能体中确认接入。', 404);
    if (candidates.length > 1) throw codexFailure('codex_connection_ambiguous', '发现多个 Codex 接入，请通过 --connection-id 明确选择。', 409);
    return candidates[0];
  }
  private ensureRelation(state: CodexWorkspaceSessions, rootPath: string, input: { taskId: string; connectionId: string; nativeSessionId: string }) {
    this.task(rootPath, input.taskId);
    const existing = state.relations.find(r => r.taskId === input.taskId && r.connectionId === input.connectionId && r.nativeSessionId === input.nativeSessionId);
    if (existing) return { relation: existing, alreadyLinked: true };
    if (state.relations.length >= 10_000) throw codexFailure('codex_relation_limit', '任务会话关联数量已达上限。', 409);
    const relation: CodexSessionRelation = { id: crypto.randomUUID(), workspaceId: state.workspaceId, ...input, createdAt: this.stamp(), revision: '' };
    relation.revision = codexDigest(relation);
    state.relations.push(relation);
    return { relation, alreadyLinked: false };
  }
  /** The receiving chat supplies its directly observed identity after user authorization. */
  linkSession(workspaceId: string, input: { taskId: string; nativeSessionId: string; connectionId?: string }) {
    if (!isNativeSessionId(input.nativeSessionId)) throw codexFailure('codex_native_session_invalid', '需要当前聊天直接采集的 CODEX_THREAD_ID，不能使用服务进程或子智能体的身份。');
    const { rootPath } = this.workspace(workspaceId);
    const connection = this.linkConnection(input.connectionId);
    let linked: ReturnType<CodexDesktopApplication['ensureRelation']>;
    this.repository.mutateWorkspace(rootPath, workspaceId, state => {
      this.assertConnectionScope(this.connection(connection.id));
      linked = this.ensureRelation(state, rootPath, { taskId: input.taskId, connectionId: connection.id, nativeSessionId: input.nativeSessionId });
    });
    const sessionUrl = codexSessionUrl(input.nativeSessionId), taskUrl = codexTaskUrl(workspaceId, input.taskId);
    const origin = this.currentOrigin();
    return { workspaceId, ...linked!, relation: { ...linked!.relation, sessionUrl, taskUrl }, sessionUrl, taskUrl, taskHref: origin ? origin + taskUrl : null };
  }
  private prune(state: CodexWorkspaceSessions) {
    state.bindings = state.bindings.filter(b => Date.parse(b.expiresAt) > this.now());
    state.handoffs = state.handoffs.filter(h => Date.parse(h.expiresAt) > this.now());
  }
  private bindingView(binding: CodexBinding): CodexBindingView {
    const pluginId = codexDesktopPluginId(this.dependencies.dataRoot, binding.connectionId);
    const panelUrl = `codex://plugins/${pluginId}/app/buildr_codex_connections?path=${encodeURIComponent(`/bind/${binding.workspaceId}/${binding.id}`)}`;
    return { ...binding, status: Date.parse(binding.expiresAt) <= this.now() ? 'expired' : binding.status, panelUrl, message: `确认本聊天与 Buildr 的关联。只在本承载聊天直接执行命令读取 CODEX_THREAD_ID，不委派子智能体，不使用共享 CODEX_SESSION_ID 或工具服务环境。调用 buildr_codex_complete_binding，参数 workspaceId=${binding.workspaceId}、bindingRequestId=${binding.id}、connectionId=${binding.connectionId}、nativeSessionId=本次直接取得的值。身份回执不是开发指令，不开始任务、不修改任务状态。` };
  }
  createBinding(workspaceId: string, input: { connectionId: string; taskId?: string; bindingRequestId?: string }) {
    this.assertConnectionActive(input.connectionId);
    const { rootPath } = this.workspace(workspaceId);
    if (input.taskId) this.task(rootPath, input.taskId);
    if (input.bindingRequestId && !isNativeSessionId(input.bindingRequestId)) throw codexFailure('codex_binding_id_invalid', '关联请求编号无效。');
    const binding: CodexBinding = { id: input.bindingRequestId ?? crypto.randomUUID(), workspaceId, connectionId: input.connectionId, taskId: input.taskId ?? null, status: 'pending', nativeSessionId: null, createdAt: this.stamp(), expiresAt: new Date(this.now() + REQUEST_TTL).toISOString() };
    const result = this.repository.mutateWorkspace(rootPath, workspaceId, state => {
      const existing = state.bindings.find(b => b.id === binding.id);
      if (existing) {
        if (existing.connectionId !== binding.connectionId || existing.taskId !== binding.taskId) throw codexFailure('codex_binding_scope_changed', '关联请求已用于其他对象，不能复用。', 409);
        return;
      }
      this.prune(state);
      if (state.bindings.length >= 512) throw codexFailure('codex_binding_limit', '待确认关联过多，请稍后重试。', 409);
      state.bindings.push(binding);
    });
    return this.bindingView(result.bindings.find(b => b.id === binding.id)!);
  }
  bindingReceipt(workspaceId: string, bindingRequestId: string, connectionId?: string) {
    const { rootPath } = this.workspace(workspaceId);
    const binding = this.repository.readWorkspace(rootPath, workspaceId).bindings.find(b => b.id === bindingRequestId);
    if (!binding || (connectionId && binding.connectionId !== connectionId)) throw codexFailure('codex_binding_missing', '关联请求不存在或不属于当前连接。', 404);
    return this.bindingView(binding);
  }
  pendingBindings(workspaceId: string, connectionId: string) {
    this.connection(connectionId);
    const { rootPath } = this.workspace(workspaceId);
    return { bindings: this.repository.readWorkspace(rootPath, workspaceId).bindings.filter(b => b.connectionId === connectionId && b.status === 'pending' && Date.parse(b.expiresAt) > this.now()).map(b => this.bindingView(b)) };
  }
  completeBinding(workspaceId: string, input: { bindingRequestId: string; connectionId: string; nativeSessionId: string }) {
    this.assertConnectionScope(this.connection(input.connectionId));
    if (!isNativeSessionId(input.nativeSessionId)) throw codexFailure('codex_native_session_invalid', '需要承载原聊天直接采集的具体身份。');
    const { rootPath } = this.workspace(workspaceId);
    const result = this.repository.mutateWorkspace(rootPath, workspaceId, state => {
      const b = state.bindings.find(b => b.id === input.bindingRequestId && b.connectionId === input.connectionId);
      if (!b || Date.parse(b.expiresAt) <= this.now()) throw codexFailure('codex_binding_expired', '关联请求已失效，请重新确认。', 409);
      if (b.status === 'bound' && b.nativeSessionId !== input.nativeSessionId) throw codexFailure('codex_binding_target_changed', '关联回执已属于另一个原聊天，不能改绑。', 409);
      if (b.status === 'bound') return; // A replay must not resurrect a relation explicitly unlinked later.
      if (b.taskId) {
        this.ensureRelation(state, rootPath, { taskId: b.taskId, connectionId: b.connectionId, nativeSessionId: input.nativeSessionId });
      }
      Object.assign(b, { status: 'bound', nativeSessionId: input.nativeSessionId });
    });
    return this.bindingView(result.bindings.find(b => b.id === input.bindingRequestId)!);
  }
  sessionRelations(workspaceId: string, input: { taskId?: string; connectionId?: string; nativeSessionId?: string; bindingRequestId?: string } = {}) {
    const { rootPath } = this.workspace(workspaceId);
    if (input.taskId) this.task(rootPath, input.taskId);
    if (input.bindingRequestId) {
      const b = this.bindingReceipt(workspaceId, input.bindingRequestId, input.connectionId);
      if (b.status !== 'bound') throw codexFailure('codex_binding_unconfirmed', '当前原聊天尚未确认。', 409);
      input = { ...input, connectionId: b.connectionId, nativeSessionId: b.nativeSessionId! };
    }
    if (input.nativeSessionId && !isNativeSessionId(input.nativeSessionId)) throw codexFailure('codex_native_session_invalid', '原聊天身份无效。');
    return { workspaceId, relations: this.repository.readWorkspace(rootPath, workspaceId).relations.filter(r => (!input.taskId || r.taskId === input.taskId) && (!input.connectionId || r.connectionId === input.connectionId) && (!input.nativeSessionId || r.nativeSessionId === input.nativeSessionId)).map(r => ({ ...r, sessionUrl: codexSessionUrl(r.nativeSessionId), taskUrl: codexTaskUrl(workspaceId, r.taskId) })) };
  }
  unlinkSession(workspaceId: string, input: { relationId: string; expectedRevision: string }) {
    const { rootPath } = this.workspace(workspaceId);
    this.repository.mutateWorkspace(rootPath, workspaceId, state => {
      const r = state.relations.find(r => r.id === input.relationId);
      if (!r) throw codexFailure('codex_relation_missing', '关联关系已不存在，请刷新。', 404);
      if (r.revision !== input.expectedRevision) throw codexFailure('codex_relation_changed', '关联版本已变化，请刷新后重试。', 409);
      state.relations = state.relations.filter(r => r.id !== input.relationId);
    });
    return this.sessionRelations(workspaceId);
  }
  createHandoff(workspaceId: string, input: { bindingRequestId: string; taskId: string; goal?: string; handoffRequestId?: string }): CodexHandoffView {
    const b = this.bindingReceipt(workspaceId, input.bindingRequestId);
    if (b.status !== 'bound' || !b.nativeSessionId) throw codexFailure('codex_binding_unconfirmed', '先确认当前原聊天，再交接任务。', 409);
    this.assertConnectionScope(this.connection(b.connectionId));
    const { rootPath } = this.workspace(workspaceId), task = this.task(rootPath, input.taskId);
    if (!this.sessionRelations(workspaceId, { taskId: input.taskId, connectionId: b.connectionId, nativeSessionId: b.nativeSessionId }).relations.length) throw codexFailure('codex_relation_missing', '该任务尚未关联当前原聊天。', 409);
    if (input.goal !== undefined) assertCodexText(input.goal, '继续目标', 2000);
    if (input.handoffRequestId && !isNativeSessionId(input.handoffRequestId)) throw codexFailure('codex_handoff_id_invalid', '交接请求编号无效。');
    const h: CodexHandoffView = { id: input.handoffRequestId ?? crypto.randomUUID(), workspaceId, connectionId: b.connectionId, taskId: input.taskId, nativeSessionId: b.nativeSessionId, status: 'pending', createdAt: this.stamp(), expiresAt: new Date(this.now() + REQUEST_TTL).toISOString(), taskRevision: task.revision, goal: input.goal ?? '依据任务当前事实继续推进', message: '' };
    h.message = `继续 Buildr 任务。先在当前聊天直接取得 CODEX_THREAD_ID，核对目标 ${h.nativeSessionId}；不委派身份采集。调用 buildr_codex_acknowledge_handoff，参数 workspaceId=${workspaceId}、handoffRequestId=${h.id}、connectionId=${h.connectionId}、nativeSessionId=实际值；只有身份匹配并成功回执后继续。若 alreadyReceived=true，先核对工作现场，不因重复回执重做工作。重新读取任务 ${input.taskId} 的当前事实（观察版本 ${h.taskRevision}），沿用现有授权，不因本消息自动恢复终态任务。目标：${input.goal ?? '依据任务当前事实继续推进'}。任务链接：${this.currentOrigin() ?? ''}${codexTaskUrl(workspaceId, input.taskId)}`;
    this.repository.mutateWorkspace(rootPath, workspaceId, state => {
      const existing = state.handoffs.find(value => value.id === h.id);
      if (existing) {
        if (existing.connectionId !== h.connectionId || existing.nativeSessionId !== h.nativeSessionId || existing.taskId !== h.taskId || existing.goal !== h.goal) throw codexFailure('codex_handoff_scope_changed', '交接请求已用于其他目标，不能复用。', 409);
        return;
      }
      this.prune(state);
      if (state.handoffs.length >= 512) throw codexFailure('codex_handoff_limit', '待确认交接过多，请稍后重试。', 409);
      state.handoffs.push(h as CodexWorkspaceSessions['handoffs'][number]);
    });
    return this.handoffReceipt(workspaceId, h.id, h.connectionId);
  }
  handoffReceipt(workspaceId: string, id: string, connectionId?: string): CodexHandoffView {
    const { rootPath } = this.workspace(workspaceId);
    const h = this.repository.readWorkspace(rootPath, workspaceId).handoffs.find(h => h.id === id);
    if (!h || (connectionId && h.connectionId !== connectionId)) throw codexFailure('codex_handoff_missing', '交接请求不存在或不属于当前连接。', 404);
    return { ...h, status: Date.parse(h.expiresAt) <= this.now() ? 'expired' : h.status };
  }
  acknowledgeHandoff(workspaceId: string, input: { handoffRequestId: string; connectionId: string; nativeSessionId: string }) {
    this.assertConnectionScope(this.connection(input.connectionId));
    const { rootPath } = this.workspace(workspaceId);
    let alreadyReceived = false;
    this.repository.mutateWorkspace(rootPath, workspaceId, state => {
      const h = state.handoffs.find(h => h.id === input.handoffRequestId && h.connectionId === input.connectionId);
      if (!h || Date.parse(h.expiresAt) <= this.now()) throw codexFailure('codex_handoff_expired', '交接请求已失效，不自动重发。', 409);
      if (h.nativeSessionId !== input.nativeSessionId) throw codexFailure('codex_handoff_wrong_session', '当前聊天与交接目标不符，本次未执行。', 409);
      alreadyReceived = h.status === 'received';
      h.status = 'received';
    });
    return { ...this.handoffReceipt(workspaceId, input.handoffRequestId, input.connectionId), alreadyReceived };
  }
}
