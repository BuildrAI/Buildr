import { api } from '../../api';
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
    restartStatus(signal?: AbortSignal): Promise<BuildrWebRestartStatusResponseBuildrWebRestartStatusResponse> {
      return api('/api/v1/app/restart-status', { headers: { 'x-buildr-session': '' }, signal }) as Promise<BuildrWebRestartStatusResponseBuildrWebRestartStatusResponse>;
    },
  };
}

export const runtimeSystemApi = createRuntimeSystemClient(api);
