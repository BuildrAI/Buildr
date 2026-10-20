import { api } from '../../api';
import type { ApiClient } from '../../api/client';
import type {
  BuildrWebRestartingResponseBuildrWebRestartingResponse,
  BuildrWebStoppingResponseBuildrWebStoppingResponse,
} from '../../../build/generated/runtime-system-http-dto';

export function createRuntimeSystemClient(api: ApiClient) {
  return {
    quit(): Promise<BuildrWebStoppingResponseBuildrWebStoppingResponse> {
      return api('/api/v1/app/quit', { method: 'POST', body: '{}' }) as Promise<BuildrWebStoppingResponseBuildrWebStoppingResponse>;
    },
    restart(): Promise<BuildrWebRestartingResponseBuildrWebRestartingResponse> {
      return api('/api/v1/app/restart', { method: 'POST', body: '{}' }) as Promise<BuildrWebRestartingResponseBuildrWebRestartingResponse>;
    },
  };
}

export const runtimeSystemApi = createRuntimeSystemClient(api);
