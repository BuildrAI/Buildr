/* eslint-disable */
// Generated from agent-assets-http JSON Schema. Do not edit.
// Run: npm run contracts:generate:workspace

export interface AgentAssetsInventoryRequestInventoryRequest {}
export interface AgentAssetsInventoryResponseInventoryResponse {
  schemaVersion: 'buildr.agent-assets-inventory/v1';
  rules: {
    [k: string]: unknown | undefined;
  }[];
  skills: {
    [k: string]: unknown | undefined;
  }[];
  commands: {
    [k: string]: unknown | undefined;
  }[];
  components: {
    [k: string]: unknown | undefined;
  }[];
  builtins: {
    [k: string]: unknown | undefined;
  }[];
  runtimeProjection: {
    [k: string]: unknown | undefined;
  };
}
export interface AgentAssetsRulesAddRequestRulesAddRequest {
  id: string;
  path?: string;
  description: string;
  replace?: boolean;
}
export interface AgentAssetsRulesRemoveRequestRulesRemoveRequest {
  id: string;
  keepFile?: boolean;
}
export interface AgentAssetsMutationResponseMutationResponse {
  operation: string;
  inventory: {
    [k: string]: unknown | undefined;
  };
}
export interface AgentAssetsErrorResponseErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
