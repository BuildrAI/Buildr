import { api } from '../../../api';
import type { ApiClient } from '../../../api/client';
import type { CodexDesktopConnectionsConnections, CodexTaskSessionsSessions, CodexBindingBinding } from '../../../../build/generated/codex-desktop-http-dto';

export type CodexConnection = CodexDesktopConnectionsConnections['connections'][number];
export type CodexSessionRelation = CodexTaskSessionsSessions['relations'][number];
export type CodexBinding = CodexBindingBinding;
const workspacePath = (workspaceId: string) => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/codex`;
export function createCodexDesktopClient(client: ApiClient) {
  return {
    connections(signal?: AbortSignal): Promise<{connections: CodexConnection[]}> { return client('/api/v1/app/codex/connections', {signal}) as Promise<{connections: CodexConnection[]}>; },
    sessions(workspaceId: string, taskId: string, signal?: AbortSignal): Promise<{workspaceId: string; relations: CodexSessionRelation[]}> { return client(workspacePath(workspaceId) + '/sessions?' + new URLSearchParams({taskId}), {signal}) as Promise<{workspaceId: string; relations: CodexSessionRelation[]}>; },
    unlink(workspaceId: string, relation: Pick<CodexSessionRelation, 'id' | 'revision'>): Promise<unknown> { return client(workspacePath(workspaceId) + '/sessions/unlink', {method: 'POST', body: JSON.stringify({relationId: relation.id, expectedRevision: relation.revision})}); },
    bind(workspaceId: string, connectionId: string, taskId?: string, bindingRequestId?: string): Promise<CodexBinding> { return client(workspacePath(workspaceId) + '/bindings', {method: 'POST', body: JSON.stringify({connectionId, ...(taskId ? {taskId} : {}), ...(bindingRequestId ? {bindingRequestId} : {})})}) as Promise<CodexBinding>; },
    binding(workspaceId: string, bindingId: string, signal?: AbortSignal): Promise<CodexBinding> { return client(workspacePath(workspaceId) + '/bindings/' + encodeURIComponent(bindingId), {signal}) as Promise<CodexBinding>; },
  };
}
export const codexDesktopApi = createCodexDesktopClient(api);
export function codexConnectionStatus(connection: CodexConnection): string {
  return {pending: '正在准备', 'awaiting-desktop': '待桌面加载', ready: '桌面已连接', unavailable: '桌面连接不可用', disconnected: '已断开'}[connection.status];
}

export function codexSessionHref(nativeSessionId: string): string | null {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(nativeSessionId) ? `codex://threads/${encodeURIComponent(nativeSessionId)}` : null;
}
