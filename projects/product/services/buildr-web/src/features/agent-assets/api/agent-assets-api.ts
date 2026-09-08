import { api } from '../../../api';
import type { ApiClient } from '../../../api/client';
import type {
  AgentAssetsInventoryResponseInventoryResponse,
  AgentAssetsMutationResponseMutationResponse,
  AgentAssetsRulesAddRequestRulesAddRequest,
  AgentAssetsRulesRemoveRequestRulesRemoveRequest,
} from '../../../../build/generated/agent-assets-http-dto';

export type AgentAssetsInventory = AgentAssetsInventoryResponseInventoryResponse;
export type AgentAssetsMutation = AgentAssetsMutationResponseMutationResponse;

export function createAgentAssetsClient(api: ApiClient) {
  return {
    inventory(): Promise<AgentAssetsInventory> {
      return api('/api/v1/agent-assets') as Promise<AgentAssetsInventory>;
    },
    addRule(input: AgentAssetsRulesAddRequestRulesAddRequest): Promise<AgentAssetsMutation> {
      return api('/api/v1/agent-assets/rules', { method: 'POST', body: JSON.stringify(input) }) as Promise<AgentAssetsMutation>;
    },
    removeRule(input: AgentAssetsRulesRemoveRequestRulesRemoveRequest): Promise<AgentAssetsMutation> {
      return api(`/api/v1/agent-assets/rules/${encodeURIComponent(input.id)}`, { method: 'DELETE', body: JSON.stringify(input) }) as Promise<AgentAssetsMutation>;
    },
  };
}

export const agentAssetsApi = createAgentAssetsClient(api);
