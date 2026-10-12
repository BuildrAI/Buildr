import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CodexAgentRegistration } from '../../agent-operations/module.ts';
import { CodexDesktopRepository } from '../persistence/codex-desktop-repository.ts';
import {
  codexDigest, codexFailure, codexSessionUrl, codexTaskUrl, isNativeSessionId, retiredCodexPlugin,
  type CodexDesktopConnection, type CodexDesktopConnectionView, type CodexSessionRelation, type CodexWorkspaceSessions,
} from '../domain/codex-desktop.ts';

type Installation = { appPath: string; appVersion: string | null };
type Dependencies = {
  dataRoot: string;
  resolveWorkspace(id: string): { rootPath: string; workspace: { id: string; name?: string } };
  readTaskIdentity(root: string, id: string): { taskId: string; title: string; revision: string } | null;
  readRegistrationActive?: (agentId: string) => boolean;
  readOrigin(): string | null;
  now?: () => number;
};
const DISCONNECTED_REASON = 'Codex 接入已移除；原聊天、配置和任务关系均保留。重新确认接入后可恢复。';
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
  private connection(id: string) {
    const connection = this.repository.readConnections().connections.find(c => c.id === id);
    if (!connection) throw codexFailure('codex_connection_missing', 'Codex 关联配置不存在，请在接入页面确认。', 404);
    return connection;
  }
  private assertConnectionScope(connection: CodexDesktopConnection) {
    if (connection.status === 'disconnected' || this.dependencies.readRegistrationActive && !this.dependencies.readRegistrationActive(connection.agentId)) throw codexFailure('codex_connection_disconnected', DISCONNECTED_REASON, 409);
    let identity: string;
    try { identity = connectionScope(connection.appPath, connection.codexHome); }
    catch { throw codexFailure('codex_connection_scope_changed', 'Codex 安装或配置来源不可用，请重新确认接入。', 409); }
    if (identity !== connection.scopeIdentity) throw codexFailure('codex_connection_scope_changed', 'Codex 配置或已观察账号范围已变化，旧关联保留，请重新确认接入。', 409);
  }
  private view(connection: CodexDesktopConnection): CodexDesktopConnectionView {
    let status: CodexDesktopConnectionView['status'] = 'configured', safeReason: string | null = null;
    try { this.assertConnectionScope(connection); }
    catch (error) { status = (error as { code?: string }).code === 'codex_connection_disconnected' ? 'disconnected' : 'unavailable'; safeReason = (error as Error).message; }
    return { id: connection.id, agentId: connection.agentId, label: connection.label === 'Codex（ChatGPT）' ? 'Codex' : connection.label, installationLabel: connection.installationLabel === 'Codex（ChatGPT）桌面' ? 'Codex 桌面' : connection.installationLabel, configurationLabel: connection.configurationLabel, status, safeReason };
  }
  listConnections() { return { connections: this.repository.readConnections().connections.map(c => this.view(c)) }; }
  assertConnectionActive(connectionId: string): void { this.assertConnectionScope(this.connection(connectionId)); }
  disconnect(agentId: string): void {
    this.repository.mutateConnections(state => {
      for (const connection of state.connections) if (connection.agentId === agentId) Object.assign(connection, { status: 'disconnected', safeReason: DISCONNECTED_REASON, connectorPid: null, preparationId: null });
    });
  }
  currentOrigin() {
    const origin = this.dependencies.readOrigin();
    if (!origin) return null;
    try { const url = new URL(origin); return url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ? url.origin : null; } catch { return null; }
  }
  async connect(registration: CodexAgentRegistration, installation: Installation) {
    if (this.dependencies.readRegistrationActive && !this.dependencies.readRegistrationActive(registration.id)) throw codexFailure('codex_connection_disconnected', DISCONNECTED_REASON, 409);
    const scopeIdentity = connectionScope(installation.appPath, registration.codexHome);
    let id: string;
    this.repository.mutateConnections(state => {
      if (connectionScope(installation.appPath, registration.codexHome) !== scopeIdentity) throw codexFailure('codex_connection_scope_changed', 'Codex 安装或配置范围在确认期间变化，请重新检查。', 409);
      if (this.dependencies.readRegistrationActive && !this.dependencies.readRegistrationActive(registration.id)) throw codexFailure('codex_connection_disconnected', DISCONNECTED_REASON, 409);
      let connection = state.connections.find(c => c.scopeIdentity === scopeIdentity);
      if (!connection) {
        if (state.connections.length >= 64) throw codexFailure('codex_connection_limit', 'Codex 关联配置数量已达上限。', 409);
        connection = { id: 'codex-' + crypto.randomUUID(), agentId: registration.id, label: registration.label, installationLabel: 'Codex 桌面', configurationLabel: '已确认的 Codex 原生配置', status: 'configured', safeReason: null, pluginVersion: null, lastSeenAt: null, executable: registration.executable, codexHome: registration.codexHome, appPath: installation.appPath, appVersion: installation.appVersion, scopeIdentity, connectorPid: null, preparationId: null, pluginEntryIdentity: null };
        state.connections.push(connection);
      } else {
        Object.assign(connection, { agentId: registration.id, executable: registration.executable, appVersion: installation.appVersion, label: registration.label, status: 'configured', safeReason: null, connectorPid: null, preparationId: null, pluginVersion: null, lastSeenAt: null, pluginEntryIdentity: null });
      }
      id = connection.id;
    });
    return this.view(this.connection(id!));
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
  // Compatibility for old in-process callers: retired actions never touch local state.
  connectorStarted(..._args: unknown[]): never { throw retiredCodexPlugin(); }
  connectorStopped(..._args: unknown[]): never { throw retiredCodexPlugin(); }
  createBinding(..._args: unknown[]): never { throw retiredCodexPlugin(); }
  bindingReceipt(..._args: unknown[]): never { throw retiredCodexPlugin(); }
  pendingBindings(..._args: unknown[]): never { throw retiredCodexPlugin(); }
  completeBinding(..._args: unknown[]): never { throw retiredCodexPlugin(); }
  createHandoff(..._args: unknown[]): never { throw retiredCodexPlugin(); }
  handoffReceipt(..._args: unknown[]): never { throw retiredCodexPlugin(); }
  acknowledgeHandoff(..._args: unknown[]): never { throw retiredCodexPlugin(); }
  sessionRelations(workspaceId: string, input: { taskId?: string; connectionId?: string; nativeSessionId?: string; bindingRequestId?: string } = {}) {
    const { rootPath } = this.workspace(workspaceId);
    if (input.taskId) this.task(rootPath, input.taskId);
    if (input.bindingRequestId) throw retiredCodexPlugin();
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
}
