import { api } from '../../../api';
import type { ApiClient } from '../../../api/client';
import type { AgentRegistryViewRegistry, AgentRunViewRun } from '../../../../build/generated/agent-operations-http-dto';

export type AgentRegistry = AgentRegistryViewRegistry;
export type AgentRun = AgentRunViewRun;
export function createAgentOperationsClient(client: ApiClient) {
  return {
    list(signal?: AbortSignal): Promise<AgentRegistry> { return client('/api/v1/app/agents', {signal}) as Promise<AgentRegistry>; },
    select(agentId: string, expectedRevision: string): Promise<AgentRegistry> { return client('/api/v1/app/agents/select', {method: 'POST', body: JSON.stringify({agentId, expectedRevision})}) as Promise<AgentRegistry>; },
    run(runId: string, signal?: AbortSignal): Promise<AgentRun> { return client('/api/v1/app/agents/runs?' + new URLSearchParams({runId}), {signal}) as Promise<AgentRun>; },
    cancel(runId: string): Promise<AgentRun> { return client('/api/v1/app/agents/cancel', {method: 'POST', body: JSON.stringify({runId})}) as Promise<AgentRun>; },
  };
}
export const agentOperationsApi = createAgentOperationsClient(api);
