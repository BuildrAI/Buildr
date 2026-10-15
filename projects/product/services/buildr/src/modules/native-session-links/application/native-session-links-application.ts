import { DshSessionLinkRepository } from '../persistence/dsh-session-link-repository.ts';
import {
  boundedSessionIdentity, dshTaskUrl, NativeSessionRelationOperations, nativeSessionFailure,
  type NativeSessionProvider, type NativeSessionRelation, type NativeSessionRelationAction, type NativeSessionQuery, type NativeSessionLinksView,
} from '../domain/native-session-links.ts';

export type DshDesktopLinksPort = {
  resolveLinkConnection(connectionId?: string): { id: string; label: string };
  assertConnectionActive(connectionId: string): void;
  openSession(connectionId: string, nativeSessionId: string): Promise<{ opened: true; nativeSessionId: string }>;
  openTask?(connectionId: string, nativeSessionId: string, taskUrl: string): Promise<{ opened: true; nativeSessionId: string }>;
};
type CodexLinksPort = {
  sessionRelations(workspaceId: string, input?: NativeSessionQuery): { workspaceId: string; relations: (NativeSessionRelation & { sessionUrl: string; taskUrl: string })[] };
  unlinkSession(workspaceId: string, input: NativeSessionRelationAction): unknown;
};
export type NativeSessionLinksDependencies = {
  resolveWorkspace(id: string): { rootPath: string; workspace: { id: string } };
  readTaskIdentity(root: string, id: string): { taskId: string; revision: string } | null;
  readOrigin(): string | null;
  now?: () => number;
};
const dshFailure = (code: string, message: string, status = 400) => nativeSessionFailure('dsh_' + code, message, status);

/** Aggregates relationships only. Desktop providers retain connection and navigation authority. */
export class NativeSessionLinksApplication {
  private codex: CodexLinksPort | null = null;
  private dsh: DshDesktopLinksPort | null = null;
  private readonly repository = new DshSessionLinkRepository();
  private readonly relations: NativeSessionRelationOperations;
  private readonly dependencies: NativeSessionLinksDependencies;
  constructor(dependencies: NativeSessionLinksDependencies) { this.dependencies = dependencies; this.relations = new NativeSessionRelationOperations(dshFailure, dependencies.now); }
  bindCodexDesktop(application: CodexLinksPort) { this.codex = application; }
  bindDshDesktop(application: DshDesktopLinksPort) { this.dsh = application; }
  private workspace(id: string) {
    if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(id)) throw nativeSessionFailure('native_session_workspace_invalid', '工作空间（Workspace）身份无效。');
    const current = this.dependencies.resolveWorkspace(id);
    if (current.workspace.id !== id) throw nativeSessionFailure('native_session_workspace_changed', '工作空间（Workspace）身份已变化。', 409);
    return current;
  }
  private task(root: string, taskId: string) {
    if (typeof taskId !== 'string' || taskId.length > 200 || !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(taskId)) throw nativeSessionFailure('native_session_task_invalid', '任务（Task）身份无效。');
    const current = this.dependencies.readTaskIdentity(root, taskId);
    if (!current || current.taskId !== taskId || !current.revision) throw nativeSessionFailure('native_session_task_missing', '任务（Task）不存在或当前不可用。', 404);
  }
  private desktop() {
    if (!this.dsh) throw dshFailure('connection_missing', '尚未接入可用的 DSH 桌面，请先确认接入。', 404);
    return this.dsh;
  }
  private taskHref(taskUrl: string) {
    const origin = this.dependencies.readOrigin();
    try { if (origin) { const url = new URL(origin); if (url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) return url.origin + taskUrl; } } catch { /* No external origin is manufactured. */ }
    return null;
  }
  dshSessionRelations(workspaceId: string, input: NativeSessionQuery = {}) {
    const { rootPath } = this.workspace(workspaceId);
    if (input.taskId) this.task(rootPath, input.taskId);
    if (input.nativeSessionId && !boundedSessionIdentity(input.nativeSessionId)) throw dshFailure('native_session_invalid', '原生会话（Session）身份无效。');
    return { workspaceId, relations: this.relations.query(this.repository.read(rootPath, workspaceId).relations, input).map(r => ({ ...r, sessionUrl: null, taskUrl: dshTaskUrl(workspaceId, r.taskId) })) };
  }
  linkDshSession(workspaceId: string, input: { taskId: string; nativeSessionId: string; connectionId?: string }) {
    if (!boundedSessionIdentity(input.nativeSessionId)) throw dshFailure('native_session_invalid', '需要当前会话（Session）直接采集的 DSH_SESSION_ID，不能用桌面焦点或子执行身份代替。');
    const { rootPath } = this.workspace(workspaceId), desktop = this.desktop(), connection = desktop.resolveLinkConnection(input.connectionId);
    let linked!: ReturnType<NativeSessionRelationOperations['ensure']>;
    this.repository.mutate(rootPath, workspaceId, state => {
      desktop.assertConnectionActive(connection.id);
      this.task(rootPath, input.taskId);
      linked = this.relations.ensure(state, { taskId: input.taskId, connectionId: connection.id, nativeSessionId: input.nativeSessionId });
    });
    const taskUrl = dshTaskUrl(workspaceId, input.taskId), taskHref = this.taskHref(taskUrl);
    return { workspaceId, provider: 'dsh' as const, ...linked, relation: { ...linked.relation, provider: 'dsh' as const, sessionUrl: null, taskUrl }, sessionUrl: null, taskUrl, taskHref };
  }
  sessionRelations(workspaceId: string, input: NativeSessionQuery & { provider?: NativeSessionProvider } = {}): NativeSessionLinksView {
    if (input.provider && input.provider !== 'codex' && input.provider !== 'dsh') throw nativeSessionFailure('native_session_provider_invalid', '会话（Session）提供者（Provider）无效。');
    if (input.nativeSessionId !== undefined && !boundedSessionIdentity(input.nativeSessionId)) throw nativeSessionFailure('native_session_identity_invalid', '原生会话（Session）身份无效。');
    const { rootPath } = this.workspace(workspaceId);
    if (input.taskId) this.task(rootPath, input.taskId);
    const result: NativeSessionLinksView = { workspaceId, relations: [], diagnostics: [] };
    for (const provider of ['codex', 'dsh'] as const) {
      if (input.provider && input.provider !== provider) continue;
      try {
        // A foreign provider's identifier format is not an error in an aggregate
        // reverse query. Preserve the legacy APIs' own identity validation.
        const query = { ...(input.taskId ? { taskId: input.taskId } : {}), ...(input.connectionId ? { connectionId: input.connectionId } : {}) };
        const view = provider === 'codex' ? this.codex?.sessionRelations(workspaceId, query) : this.dshSessionRelations(workspaceId, query);
        if (view) result.relations.push(...this.relations.query<NativeSessionRelation & { sessionUrl: string | null; taskUrl: string }>(view.relations, { nativeSessionId: input.nativeSessionId }).map(r => ({ ...r, provider })));
      } catch (error) {
        const known = error as { code?: string; message?: string };
        result.diagnostics.push({ provider, code: known.code || 'native_session_read_failed', message: known.code?.startsWith(provider + '_') ? known.message || '会话（Session）关联读取失败。' : '会话（Session）关联暂时无法读取，另一提供者（Provider）的结果保留。' });
      }
    }
    return result;
  }
  unlinkSession(workspaceId: string, input: NativeSessionRelationAction & { provider: NativeSessionProvider }) {
    const { rootPath } = this.workspace(workspaceId);
    if (input.provider === 'codex') {
      if (!this.codex) throw nativeSessionFailure('native_session_provider_unavailable', 'Codex 关系能力当前不可用。', 409);
      this.codex.unlinkSession(workspaceId, input);
    } else if (input.provider === 'dsh') this.repository.mutate(rootPath, workspaceId, state => this.relations.unlink(state, input));
    else throw nativeSessionFailure('native_session_provider_invalid', '会话（Session）提供者（Provider）无效。');
    return this.sessionRelations(workspaceId);
  }
  async openSession(workspaceId: string, input: NativeSessionRelationAction & { provider: NativeSessionProvider }) {
    if (input.provider !== 'dsh') throw nativeSessionFailure('native_session_open_unsupported', 'Codex 请使用已有会话（Session）链接打开。');
    const { rootPath } = this.workspace(workspaceId), state = this.repository.read(rootPath, workspaceId), relation = this.relations.observed(state.relations, input), desktop = this.desktop();
    desktop.assertConnectionActive(relation.connectionId);
    const opened = await desktop.openSession(relation.connectionId, relation.nativeSessionId);
    if (opened?.opened !== true || opened.nativeSessionId !== relation.nativeSessionId) throw dshFailure('session_open_unconfirmed', 'DSH 未确认选中目标会话（Session），请刷新后核对。', 502);
    return { provider: 'dsh' as const, ...opened };
  }
  async openDshTask(workspaceId: string, input: { taskId: string; nativeSessionId: string; connectionId?: string }) {
    if (!boundedSessionIdentity(input.nativeSessionId)) throw dshFailure('native_session_invalid', '需要当前会话（Session）直接采集的 DSH_SESSION_ID。');
    const { rootPath } = this.workspace(workspaceId), desktop = this.desktop();
    this.task(rootPath, input.taskId);
    const connection = desktop.resolveLinkConnection(input.connectionId);
    const relation = this.relations.query(this.repository.read(rootPath, workspaceId).relations, { taskId: input.taskId, nativeSessionId: input.nativeSessionId, connectionId: connection.id })[0];
    if (!relation) throw dshFailure('relation_missing', '当前会话（Session）尚未关联此任务（Task），请先关联。', 404);
    const taskUrl = dshTaskUrl(workspaceId, relation.taskId), taskHref = this.taskHref(taskUrl);
    if (!taskHref) throw dshFailure('task_origin_unavailable', '本渠道 Buildr 入口当前不可用，未打开任务（Task）。', 409);
    if (!desktop.openTask) throw dshFailure('task_open_unavailable', 'DSH 桌面当前不支持准确任务（Task）导航。', 409);
    this.relations.observed(this.repository.read(rootPath, workspaceId).relations, { relationId: relation.id, expectedRevision: relation.revision });
    desktop.assertConnectionActive(connection.id);
    const opened = await desktop.openTask(connection.id, relation.nativeSessionId, taskHref);
    if (opened?.opened !== true || opened.nativeSessionId !== relation.nativeSessionId) throw dshFailure('task_open_unconfirmed', 'DSH 未确认打开准确任务（Task），请刷新后核对。', 502);
    return { ...opened, provider: 'dsh' as const, taskUrl, taskHref };
  }
}
