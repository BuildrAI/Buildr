import type { ApiClient } from './client';
import type {
  BuildrWebStoppingResponseBuildrWebStoppingResponse,
} from './generated/runtime-system-http-dto';

export function createRuntimeSystemClient(api: ApiClient) {
  return {
    quit(): Promise<BuildrWebStoppingResponseBuildrWebStoppingResponse> {
      return api('/api/v1/app/quit', { method: 'POST', body: '{}' }) as Promise<BuildrWebStoppingResponseBuildrWebStoppingResponse>;
    },
  };
}
