import type { SkillCandidatesResponseSkillCandidatesResponse, SkillRegisterRequestSkillRegisterRequest, SkillRemovalResponseSkillRemovalResponse } from '../../../../build/generated/agent-assets-http-dto';
import { api } from '../../../api';
import type { ApiClient } from '../../../api/client';
import type {
  AgentAssetsInventoryResponseInventoryResponse,
  SkillsListResponseSkillsListResponse,
  SkillDetailResponseSkillDetailResponse,
  SkillFileResponseSkillFileResponse,
  AgentAssetsMutationResponseMutationResponse,
  AgentAssetsRulesAddRequestRulesAddRequest,
  AgentAssetsRulesRemoveRequestRulesRemoveRequest,
} from '../../../../build/generated/agent-assets-http-dto';

export type AgentAssetsInventory = AgentAssetsInventoryResponseInventoryResponse;
export type SkillSummary = SkillsListResponseSkillsListResponse['skills'][number];
export type SkillDetail = SkillDetailResponseSkillDetailResponse;
export type SkillFile = SkillFileResponseSkillFileResponse;
export type AgentAssetsMutation = AgentAssetsMutationResponseMutationResponse;

export function createAgentAssetsClient(api: ApiClient) {
  return {
    skillCandidates: (signal?: AbortSignal) => api('/api/v1/agent-assets/skill-candidates', { signal }) as Promise<SkillCandidatesResponseSkillCandidatesResponse>,
    registerSkill: (input: SkillRegisterRequestSkillRegisterRequest) => api('/api/v1/agent-assets/skills', { method: 'POST', body: JSON.stringify(input) }),
    skillRemoval: (id: string, signal?: AbortSignal) => api(`/api/v1/agent-assets/skills/${encodeURIComponent(id)}/removal`, { signal }) as Promise<SkillRemovalResponseSkillRemovalResponse>,
    removeSkill: (id: string, revision: string) => api(`/api/v1/agent-assets/skills/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ revision }) }),
    skills(options: Pick<RequestInit, 'signal'> = {}): Promise<SkillsListResponseSkillsListResponse> {
      return api('/api/v1/agent-assets/skills', options) as Promise<SkillsListResponseSkillsListResponse>;
    },
    skillDetail(id: string, options: Pick<RequestInit, 'signal'> = {}): Promise<SkillDetail> {
      return api(`/api/v1/agent-assets/skills/${encodeURIComponent(id)}`, options) as Promise<SkillDetail>;
    },
    skillFile(id: string, path: string, options: Pick<RequestInit, 'signal'> = {}): Promise<SkillFile> {
      return api(`/api/v1/agent-assets/skills/${encodeURIComponent(id)}/file?file=${encodeURIComponent(path)}`, options) as Promise<SkillFile>;
    },
    inventory(options: Pick<RequestInit, 'signal'> = {}): Promise<AgentAssetsInventory> {
      return api('/api/v1/agent-assets', options) as Promise<AgentAssetsInventory>;
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
