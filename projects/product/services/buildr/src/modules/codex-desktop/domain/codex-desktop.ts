import crypto from 'node:crypto';

export type CodexDesktopConnectionView = {
  id: string; agentId: string; label: string; installationLabel: string; configurationLabel: string;
  status: 'pending' | 'awaiting-desktop' | 'ready' | 'unavailable' | 'disconnected'; safeReason: string | null;
  pluginVersion: string | null; lastSeenAt: string | null;
};
export type CodexDesktopConnection = CodexDesktopConnectionView & {
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
export type CodexBindingView = Omit<CodexBinding, 'status'> & { status: CodexBinding['status'] | 'expired'; panelUrl: string; message: string };
export type CodexHandoff = {
  id: string; workspaceId: string; connectionId: string; taskId: string; nativeSessionId: string;
  status: 'pending' | 'received'; createdAt: string; expiresAt: string; taskRevision: string; goal: string; message: string;
};
export type CodexHandoffView = Omit<CodexHandoff, 'status'> & { status: CodexHandoff['status'] | 'expired' };
export type CodexWorkspaceSessions = { schemaVersion: 'buildr.codex-workspace-sessions/v1'; workspaceId: string; relations: CodexSessionRelation[]; bindings: CodexBinding[]; handoffs: CodexHandoff[] };
export type CodexConnections = { schemaVersion: 'buildr.codex-desktop-connections/v1'; connections: CodexDesktopConnection[] };
export const codexDigest = (value: unknown) => 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const codexFailure = (code: string, message: string, status = 400): Error & { code: string; status: number } => Object.assign(new Error(message), { code, status });
export const isNativeSessionId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function assertCodexText(value: unknown, name: string, max = 256): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw codexFailure('codex_input_invalid', `${name}无效。`);
}
export function assertCodexFields(value: unknown, allowed: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw codexFailure('codex_input_invalid', 'Codex 请求字段无效。');
}
export const codexTaskUrl = (workspaceId: string, taskId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/codex#/tasks/${encodeURIComponent(taskId)}`;
export const codexSessionUrl = (id: string) => `codex://threads/${encodeURIComponent(id)}`;
