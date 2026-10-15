import crypto from 'node:crypto';

export type NativeSessionProvider = 'codex' | 'dsh';
export type NativeSessionRelation = {
  id: string; workspaceId: string; taskId: string; connectionId: string; nativeSessionId: string;
  createdAt: string; revision: string;
};
export type NativeSessionRelationView = NativeSessionRelation & { provider: NativeSessionProvider; sessionUrl: string | null; taskUrl: string };
export type NativeSessionQuery = { taskId?: string; connectionId?: string; nativeSessionId?: string };
export type NativeSessionRelationAction = { relationId: string; expectedRevision: string };
export type NativeSessionDiagnostic = { provider: NativeSessionProvider; code: string; message: string };
export type NativeSessionLinksView = { workspaceId: string; relations: NativeSessionRelationView[]; diagnostics: NativeSessionDiagnostic[] };
export type NativeSessionFailure = (code: string, message: string, status?: number) => Error & { code: string; status: number };
export const nativeSessionFailure: NativeSessionFailure = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
export const relationDigest = (value: unknown) => 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const boundedSessionIdentity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u0020\u007f]/u.test(value);
export const dshTaskUrl = (workspaceId: string, taskId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}`;

/** Shared relationship invariants; connection identity and storage remain provider-owned. */
export class NativeSessionRelationOperations {
  private readonly failure: NativeSessionFailure;
  private readonly now: () => number;
  constructor(failure: NativeSessionFailure, now: () => number = Date.now) { this.failure = failure; this.now = now; }
  ensure(state: { workspaceId: string; relations: NativeSessionRelation[] }, input: { taskId: string; connectionId: string; nativeSessionId: string }) {
    const existing = state.relations.find(r => r.taskId === input.taskId && r.connectionId === input.connectionId && r.nativeSessionId === input.nativeSessionId);
    if (existing) return { relation: existing, alreadyLinked: true };
    if (state.relations.length >= 10_000) throw this.failure('relation_limit', '任务（Task）与会话（Session）关联数量已达上限。', 409);
    const relation: NativeSessionRelation = { id: crypto.randomUUID(), workspaceId: state.workspaceId, ...input, createdAt: new Date(this.now()).toISOString(), revision: '' };
    relation.revision = relationDigest(relation);
    state.relations.push(relation);
    return { relation, alreadyLinked: false };
  }
  query<T extends NativeSessionRelation>(relations: T[], input: NativeSessionQuery = {}): T[] {
    return relations.filter(r => (!input.taskId || r.taskId === input.taskId) && (!input.connectionId || r.connectionId === input.connectionId) && (!input.nativeSessionId || r.nativeSessionId === input.nativeSessionId));
  }
  observed(relations: NativeSessionRelation[], input: NativeSessionRelationAction) {
    const relation = relations.find(r => r.id === input.relationId);
    if (!relation) throw this.failure('relation_missing', '关联关系已不存在，请刷新。', 404);
    if (relation.revision !== input.expectedRevision) throw this.failure('relation_changed', '关联版本已变化，请刷新后重试。', 409);
    return relation;
  }
  unlink(state: { relations: NativeSessionRelation[] }, input: NativeSessionRelationAction) {
    this.observed(state.relations, input);
    state.relations = state.relations.filter(r => r.id !== input.relationId);
  }
}
