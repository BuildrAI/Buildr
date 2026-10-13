import { api } from '../../../api';
import type { ApiClient } from '../../../api/client';
import type { NativeTaskSessionsSessions, NativeSessionOpenResultOpen } from '../../../../build/generated/native-session-links-http-dto';

export type AgentSessions = NativeTaskSessionsSessions;
export type AgentSessionRelation = AgentSessions['relations'][number];
export type AgentSessionDiagnostic = AgentSessions['diagnostics'][number];
export type AgentSessionOpenResult = NativeSessionOpenResultOpen;
type RelationVersion = Pick<AgentSessionRelation, 'provider' | 'id' | 'revision'>;
const workspacePath = (workspaceId: string) => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/agent-sessions`;
const relationInput = (relation: RelationVersion) => ({provider: relation.provider, relationId: relation.id, expectedRevision: relation.revision});
export function createAgentSessionsClient(client: ApiClient) {
  return {
    sessions(workspaceId: string, taskId: string, signal?: AbortSignal): Promise<AgentSessions> { return client(workspacePath(workspaceId) + '?' + new URLSearchParams({taskId}), {signal}) as Promise<AgentSessions>; },
    unlink(workspaceId: string, relation: RelationVersion): Promise<AgentSessions> { return client(workspacePath(workspaceId) + '/unlink', {method: 'POST', body: JSON.stringify(relationInput(relation))}) as Promise<AgentSessions>; },
    open(workspaceId: string, relation: RelationVersion): Promise<AgentSessionOpenResult> { return client(workspacePath(workspaceId) + '/open', {method: 'POST', body: JSON.stringify(relationInput(relation))}) as Promise<AgentSessionOpenResult>; },
  };
}
export const agentSessionsApi = createAgentSessionsClient(api);
