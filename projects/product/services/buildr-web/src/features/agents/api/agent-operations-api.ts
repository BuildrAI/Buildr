import { api } from '../../../api';
import type { ApiClient } from '../../../api/client';
import type { AgentRegistryViewRegistry, AgentRunViewRun, CodexDiscoveryViewDiscovery, CodexConnectResultConnect, CodexRemoveResultRemove } from '../../../../build/generated/agent-operations-http-dto';

export type AgentRegistry = AgentRegistryViewRegistry;
export type AgentRun = AgentRunViewRun;
export type CodexDiscovery = CodexDiscoveryViewDiscovery;
export type CodexCandidate = CodexDiscovery['candidates'][number];
export type CodexConnectResult = CodexConnectResultConnect;
export type CodexRemoveResult = CodexRemoveResultRemove;
export type CodexConnectRequest = {candidateId: string; expectedDiscoveryRevision: string; expectedRevision: string; makeDefault?: boolean; existingAgentId?: string};
export function createAgentOperationsClient(client: ApiClient) {
  return {
    list(signal?: AbortSignal): Promise<AgentRegistry> { return client('/api/v1/app/agents', {signal}) as Promise<AgentRegistry>; },
    select(agentId: string, expectedRevision: string): Promise<AgentRegistry> { return client('/api/v1/app/agents/select', {method: 'POST', body: JSON.stringify({agentId, expectedRevision})}) as Promise<AgentRegistry>; },
    run(runId: string, signal?: AbortSignal): Promise<AgentRun> { return client('/api/v1/app/agents/runs?' + new URLSearchParams({runId}), {signal}) as Promise<AgentRun>; },
    cancel(runId: string): Promise<AgentRun> { return client('/api/v1/app/agents/cancel', {method: 'POST', body: JSON.stringify({runId})}) as Promise<AgentRun>; },
    discoverCodex(signal?: AbortSignal): Promise<CodexDiscovery> { return client('/api/v1/app/agents/codex/discovery', {signal}) as Promise<CodexDiscovery>; },
    connectCodex(input: CodexConnectRequest): Promise<CodexConnectResult> { return client('/api/v1/app/agents/codex/connect', {method: 'POST', body: JSON.stringify(input)}) as Promise<CodexConnectResult>; },
    removeCodex(agentId: string, expectedRevision: string): Promise<CodexRemoveResult> { return client('/api/v1/app/agents/codex/remove', {method: 'POST', body: JSON.stringify({agentId, expectedRevision})}) as Promise<CodexRemoveResult>; },
  };
}
export const agentOperationsApi = createAgentOperationsClient(api);
