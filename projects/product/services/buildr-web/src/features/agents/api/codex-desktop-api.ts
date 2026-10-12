import { api } from '../../../api';
import type { ApiClient } from '../../../api/client';
import type { CodexDesktopConnectionsConnections, CodexTaskSessionsSessions } from '../../../../build/generated/codex-desktop-http-dto';

export type CodexConnection = CodexDesktopConnectionsConnections['connections'][number];
export type CodexSessionRelation = CodexTaskSessionsSessions['relations'][number];
const workspacePath = (workspaceId: string) => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/codex`;
export function createCodexDesktopClient(client: ApiClient) {
  return {
    connections(signal?: AbortSignal): Promise<{connections: CodexConnection[]}> { return client('/api/v1/app/codex/connections', {signal}) as Promise<{connections: CodexConnection[]}>; },
    sessions(workspaceId: string, taskId: string, signal?: AbortSignal): Promise<{workspaceId: string; relations: CodexSessionRelation[]}> { return client(workspacePath(workspaceId) + '/sessions?' + new URLSearchParams({taskId}), {signal}) as Promise<{workspaceId: string; relations: CodexSessionRelation[]}>; },
    unlink(workspaceId: string, relation: Pick<CodexSessionRelation, 'id' | 'revision'>): Promise<unknown> { return client(workspacePath(workspaceId) + '/sessions/unlink', {method: 'POST', body: JSON.stringify({relationId: relation.id, expectedRevision: relation.revision})}); },
  };
}
export const codexDesktopApi = createCodexDesktopClient(api);
export function codexConnectionStatus(connection: CodexConnection): string {
  return {configured: '已配置', unavailable: '需检查', disconnected: '已移除'}[connection.status];
}

export function codexSessionHref(nativeSessionId: string): string | null {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(nativeSessionId) ? `codex://threads/${encodeURIComponent(nativeSessionId)}` : null;
}
