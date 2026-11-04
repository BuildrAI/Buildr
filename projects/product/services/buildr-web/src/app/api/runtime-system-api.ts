import { api } from '../../api';
import type { RuntimeStatusRuntimeStatus } from '../../../build/generated/agent-service-http-dto';
import type { ApiClient } from '../../api/client';
import type {
  BuildrWebRestartingResponseBuildrWebRestartingResponse,
  BuildrWebRestartStatusResponseBuildrWebRestartStatusResponse,
  BuildrWebStoppingResponseBuildrWebStoppingResponse,
} from '../../../build/generated/runtime-system-http-dto';

export function createRuntimeSystemClient(api: ApiClient) {
  return {
    quit(): Promise<BuildrWebStoppingResponseBuildrWebStoppingResponse> {
      return api('/api/v1/app/quit', { method: 'POST', body: '{}' }) as Promise<BuildrWebStoppingResponseBuildrWebStoppingResponse>;
    },
    restart(signal?: AbortSignal): Promise<BuildrWebRestartingResponseBuildrWebRestartingResponse> {
      return api('/api/v1/app/restart', { method: 'POST', body: '{}', signal }) as Promise<BuildrWebRestartingResponseBuildrWebRestartingResponse>;
    },
    agentRuntime(signal?: AbortSignal): Promise<RuntimeStatusRuntimeStatus> {
      return api('/api/v1/app/agent-service/runtime', {headers:{'x-buildr-session':''},signal}) as Promise<RuntimeStatusRuntimeStatus>;
    },
    restartAgent(expectedGeneration: string, signal?: AbortSignal): Promise<RuntimeStatusRuntimeStatus> {
      return api('/api/v1/app/agent-service/runtime/restart', {method:'POST',body:JSON.stringify({expectedGeneration}),signal}) as Promise<RuntimeStatusRuntimeStatus>;
    },
    restartStatus(signal?: AbortSignal): Promise<BuildrWebRestartStatusResponseBuildrWebRestartStatusResponse> {
      return api('/api/v1/app/restart-status', { headers: { 'x-buildr-session': '' }, signal }) as Promise<BuildrWebRestartStatusResponseBuildrWebRestartStatusResponse>;
    },
  };
}

export const runtimeSystemApi = createRuntimeSystemClient(api);
