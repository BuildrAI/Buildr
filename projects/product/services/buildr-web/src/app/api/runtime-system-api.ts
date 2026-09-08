import { api } from '../../api';
import type { ApiClient } from '../../api/client';
import type {
  BuildrWebStoppingResponseBuildrWebStoppingResponse,
} from '../../../build/generated/runtime-system-http-dto';

export function createRuntimeSystemClient(api: ApiClient) {
  return {
    quit(): Promise<BuildrWebStoppingResponseBuildrWebStoppingResponse> {
      return api('/api/v1/app/quit', { method: 'POST', body: '{}' }) as Promise<BuildrWebStoppingResponseBuildrWebStoppingResponse>;
    },
  };
}

export const runtimeSystemApi = createRuntimeSystemClient(api);
