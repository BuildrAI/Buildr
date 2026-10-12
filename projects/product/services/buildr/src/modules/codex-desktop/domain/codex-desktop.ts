import crypto from 'node:crypto';

export type CodexDesktopConnectionView = {
  id: string; agentId: string; label: string; installationLabel: string; configurationLabel: string;
  status: 'configured' | 'unavailable' | 'disconnected'; safeReason: string | null;
};
export type CodexDesktopConnection = Omit<CodexDesktopConnectionView, 'status'> & {
  status: CodexDesktopConnectionView['status'] | 'pending' | 'awaiting-desktop' | 'ready';
  pluginVersion: string | null; lastSeenAt: string | null;
  executable: string; codexHome: string; appPath: string; appVersion: string | null;
  scopeIdentity: string; connectorPid: number | null; preparationId: string | null; pluginEntryIdentity: string | null;
};
export type CodexSessionRelation = {
  id: string; workspaceId: string; taskId: string; connectionId: string; nativeSessionId: string;
  createdAt: string; revision: string;
};
export type CodexSessionRelationView = CodexSessionRelation & { sessionUrl: string; taskUrl: string };
export type CodexBinding = {
  id: string; workspaceId: string; connectionId: string; taskId: string | null;
  status: 'pending' | 'bound'; nativeSessionId: string | null; createdAt: string; expiresAt: string;
};
export type CodexHandoff = {
  id: string; workspaceId: string; connectionId: string; taskId: string; nativeSessionId: string;
  status: 'pending' | 'received'; createdAt: string; expiresAt: string; taskRevision: string; goal: string; message: string;
};
export type CodexWorkspaceSessions = { schemaVersion: 'buildr.codex-workspace-sessions/v1'; workspaceId: string; relations: CodexSessionRelation[]; bindings: CodexBinding[]; handoffs: CodexHandoff[] };
export type CodexConnections = { schemaVersion: 'buildr.codex-desktop-connections/v1'; connections: CodexDesktopConnection[] };
export const codexDigest = (value: unknown) => 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const codexFailure = (code: string, message: string, status = 400): Error & { code: string; status: number } => Object.assign(new Error(message), { code, status });
export const retiredCodexPlugin = () => codexFailure('codex_plugin_retired', 'Buildr 的 Codex 插件与聊天卡片已退役。请在当前聊天提供任务编号，通过 buildr codex link 关联，或用 buildr codex sessions 查询已有关系。', 410);
export const isNativeSessionId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const codexTaskUrl = (workspaceId: string, taskId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/codex#/tasks/${encodeURIComponent(taskId)}`;
export const codexSessionUrl = (id: string) => `codex://threads/${encodeURIComponent(id)}`;
